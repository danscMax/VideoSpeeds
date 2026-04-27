/**
 * Builds the in-player panel: speed buttons row + slider + gear (settings)
 * button + (lazy-mounted) settings modal. Returns a control surface the
 * UiPort impl wraps to fulfil the Wave 1.7 controller's calls.
 *
 * The panel is created BEFORE the AppContext is fully assembled (to avoid
 * the chicken-and-egg between AppContext.ui and UiPort impl construction).
 * Therefore we receive the bits we need (settings/speed stores, cleanup,
 * i18n, discovery, the click router from the speed controller) directly,
 * and the orchestrator (Wave 1.10) wires the UiPort hook afterwards.
 */

import { handleSpeedButtonClick, setSpeed } from '../speed/controller';
import { vsFilledGearIcon } from './icons';
import {
  DEFAULT_PRESETS,
  refreshActiveButton,
  renderButtonsRow,
} from './buttons';
import { renderSlider, setSliderValue, updateSliderFill } from './slider';
import { renderSettingsMenu, type ActiveTab } from './settings/modal';
import { attachSettingsHandlers } from './settings/handlers';
import { refreshDiagnosticStatus } from './settings/diag-status';
import { safeSetInnerHTML } from './safe-html';
import type { AppContext } from '../app/context';
import { CleanupRegistry } from '../app/cleanup';
import { speedBoundsFor } from '../config';

/** Diag-action sink. The orchestrator passes a real implementation that
 *  can purge cache, copy report, or trip the KillSwitch. */
export interface DiagActions {
  recheck(): void;
  copyReport(): Promise<boolean>;
  purgeCache(): Promise<void>;
  fullReset(): Promise<void>;
}

/** KillSwitch read/write, surfaced through the panel so the settings
 *  modal can bind discovery/healthcheck toggles. */
export interface KillSwitchControl {
  isDiscoveryEnabled(): boolean;
  isHealthCheckEnabled(): boolean;
  setDiscoveryEnabled(on: boolean): Promise<void>;
  setHealthCheckEnabled(on: boolean): Promise<void>;
}

export interface PanelHandle {
  /** The root DOM node to insert into the player. */
  element: HTMLElement;
  /** Call after the speed changes (sync; no DOM thrash). */
  refreshButtons: (speed: number) => void;
  refreshSlider: (speed: number) => void;
  /** Re-render the settings modal contents (after a setting change). */
  rerenderSettings: () => void;
  /** Apply layout changes (slider position toggled). */
  applyLayout: () => void;
  /** Toggle the red warning dot on the gear icon. Wired by the
   *  orchestrator's HealthChecker subscription so the user sees a
   *  visual cue that diagnostics found a problem (audit A3.1). */
  setGearWarning: (on: boolean) => void;
  dispose: () => void;
}

export interface CreatePanelOptions {
  ctx: AppContext;
  scriptVersion: string;
  /** Custom preset list per site; falls back to DEFAULT_PRESETS. */
  presets?: readonly number[];
  /** Real KillSwitch handle. Populated by the orchestrator (Wave 1.10);
   *  the popup builds a stub that returns true/no-ops. */
  killSwitch?: KillSwitchControl;
  /** Diagnostic action sink. Defaults to no-ops when not provided. */
  diagActions?: DiagActions;
}

export function createPanel(opts: CreatePanelOptions): PanelHandle {
  const { ctx, scriptVersion } = opts;
  const presets = opts.presets ?? DEFAULT_PRESETS[ctx.site] ?? [1, 1.5, 2];
  const bounds = speedBoundsFor(ctx.site);
  const killSwitch = opts.killSwitch;
  const diagActions = opts.diagActions;

  const root = document.createElement('div');
  root.className = 'vs-panel';
  root.dataset.vsSite = ctx.site;

  const buttonsRow = renderButtonsRow({ speeds: presets, current: ctx.speedStore.current() });
  const sliderContainer = renderSlider({
    current: ctx.speedStore.current(),
    min: bounds.min,
    max: bounds.max,
  });

  const gearWrapper = document.createElement('div');
  gearWrapper.className = 'vs-gear-wrapper';
  const gearBtn = document.createElement('button');
  gearBtn.type = 'button';
  gearBtn.className = 'vs-gear-button';
  gearBtn.title = ctx.i18n.t('menu.title');
  safeSetInnerHTML(gearBtn, vsFilledGearIcon(16));

  const settingsMenu = document.createElement('div');
  settingsMenu.className = 'settings-menu';
  settingsMenu.setAttribute('aria-hidden', 'true');

  gearWrapper.appendChild(gearBtn);
  gearWrapper.appendChild(settingsMenu);

  root.appendChild(buttonsRow);
  root.appendChild(sliderContainer);
  root.appendChild(gearWrapper);

  // ----- Tab state preserved across rerenders -----
  let activeTab: ActiveTab = 'general';

  // ----- Click handlers on speed buttons -----
  ctx.cleanup.addEventListener(buttonsRow, 'click', (event) => {
    const target = event.target as HTMLElement | null;
    const btn = target?.closest<HTMLButtonElement>('.speed-button');
    if (!btn) return;
    const speed = parseFloat(btn.dataset.vsSpeed ?? '');
    if (Number.isFinite(speed)) {
      handleSpeedButtonClick(ctx, speed);
    }
  });

  // ----- Slider input -----
  // Drag goes through plain setSpeed(), NOT through handleSpeedButtonClick.
  // The click router has a 400ms debounce counter that increments on every
  // tick; routing slider 'input' events through it counted each pixel of
  // drag as another click and after 2 ticks force-promoted the drag to
  // setGlobal (toast + force-enabled rememberSpeed) -- regression flagged
  // by Wave A audit. Original userscript at .user.js:4817-4821 also
  // sidesteps the click semantics for slider drag.
  const sliderInput = sliderContainer.querySelector<HTMLInputElement>('.speed-slider');
  if (sliderInput) {
    ctx.cleanup.addEventListener(sliderInput, 'input', () => {
      const value = parseFloat(sliderInput.value);
      if (Number.isFinite(value)) {
        updateSliderFill(sliderInput);
        void setSpeed(ctx, value);
      }
    });
    // Mobile: stop the page from scrolling while the user drags the slider
    // thumb. Mirrors .user.js:4824-4829 — without this, dragging on a
    // touch device scrolls the viewport instead of moving the thumb.
    // `passive: false` is required for preventDefault on touch events.
    ctx.cleanup.addEventListener(
      sliderInput,
      'touchmove',
      (e) => { e.preventDefault(); },
      { passive: false },
    );
  }

  // ----- Menu-scoped cleanup registry. Disposed + replaced on every
  //       rerender so attachSettingsHandlers' ~25 listeners-per-render
  //       don't accumulate on the panel's main registry forever (would
  //       leak DOM-node refs to detached settings-menu children).
  let menuRegistry: CleanupRegistry | null = null;
  ctx.cleanup.add(() => {
    if (menuRegistry) {
      try { menuRegistry.dispose(); } catch { /* swallow */ }
      menuRegistry = null;
    }
  });

  // ----- Gear toggle -----
  //
  // After making the menu visible we measure its bounding box and flip
  // its anchor to the LEFT if the default right-anchored position
  // pushes it off the viewport (audit: user reported the menu vanishing
  // off the screen on narrow layouts where the gear sits near the
  // viewport's left edge -- happens in `bottom` layout when the panel
  // wraps and the gear lands on the second row).
  function isMenuOpen(): boolean {
    return settingsMenu.classList.contains('show');
  }

  function adjustMenuPosition(): void {
    if (!isMenuOpen()) return;
    // Reset flip first so the right-anchored measurement is honest.
    settingsMenu.removeAttribute('data-vs-flip');
    const rect = settingsMenu.getBoundingClientRect();
    if (rect.left < 4) {
      settingsMenu.setAttribute('data-vs-flip', 'left');
    }
  }

  ctx.cleanup.addEventListener(gearBtn, 'click', (event) => {
    event.stopPropagation();
    if (isMenuOpen()) {
      settingsMenu.classList.remove('show');
      settingsMenu.setAttribute('aria-hidden', 'true');
    } else {
      rerenderSettings();
      settingsMenu.classList.add('show');
      settingsMenu.setAttribute('aria-hidden', 'false');
      adjustMenuPosition();
    }
  });

  // Stop clicks INSIDE the menu from bubbling to YouTube's body-level
  // click delegation (Polymer/React event delegate would otherwise
  // re-interpret tab/toggle clicks as host-page actions). Ported from
  // .user.js:4758. Also keeps the document-close handler below from
  // firing on intra-menu clicks.
  ctx.cleanup.addEventListener(settingsMenu, 'click', (event) => {
    event.stopPropagation();
  });

  // Click outside the gear-wrapper closes the menu.
  ctx.cleanup.addEventListener(document, 'click', (event) => {
    if (!isMenuOpen()) return;
    const target = event.target as Node | null;
    if (target && !gearWrapper.contains(target)) {
      settingsMenu.classList.remove('show');
      settingsMenu.setAttribute('aria-hidden', 'true');
    }
  });

  // ----- Settings re-renderer -----
  function rerenderSettings(): void {
    // Dispose the previous menu's listeners first. Bounds the listener
    // count to the current render's needs.
    if (menuRegistry) menuRegistry.dispose();
    menuRegistry = new CleanupRegistry();
    const menuCtx: AppContext = { ...ctx, cleanup: menuRegistry };

    safeSetInnerHTML(
      settingsMenu,
      renderSettingsMenu({
        settings: ctx.settingsStore.get(),
        site: ctx.site,
        i18n: ctx.i18n,
        activeTab,
        scriptVersion,
        // Read each flag from its OWN getter. The previous code used
        // killSwitchEngaged() (= !healthCheckEnabled) for the discovery
        // toggle, so the discovery checkbox always mirrored the
        // healthcheck state -- regression M8.
        discoveryEnabled: killSwitch ? killSwitch.isDiscoveryEnabled() : true,
        healthCheckEnabled: killSwitch ? killSwitch.isHealthCheckEnabled() : true,
      }),
    );

    attachSettingsHandlers(settingsMenu, menuCtx, {
      setActiveTab: (t) => { activeTab = t; },
      rerender: rerenderSettings,
      onDiag: (action) => {
        ctx.logger.info('diagnostics action', action);
        if (action === 'recheck') {
          if (diagActions) {
            diagActions.recheck();
          }
          refreshDiagnosticStatus(settingsMenu, menuCtx);
          // Toast the result so the user gets feedback. Mirrors
          // .user.js:4585-4588.
          const ok = ctx.diagnostics.isHealthy();
          ctx.ui.showNotification(
            ctx.i18n.t(ok ? 'toast.diag_ok' : 'toast.diag_issues'),
            ok ? 'success' : 'warn',
          );
        } else if (action === 'copy') {
          if (diagActions) {
            void diagActions.copyReport().then((copied) => {
              ctx.ui.showNotification(
                ctx.i18n.t(copied ? 'toast.report_copied' : 'toast.report_copy_failed'),
                copied ? 'success' : 'error',
              );
            });
          }
        } else if (action === 'purge-cache') {
          if (diagActions) {
            void diagActions.purgeCache().then(() => {
              ctx.ui.showNotification(ctx.i18n.t('toast.cache_cleared'), 'info');
              refreshDiagnosticStatus(settingsMenu, menuCtx);
            });
          }
        } else if (action === 'full-reset') {
          if (diagActions) {
            void diagActions.fullReset().then(() => {
              ctx.ui.showNotification(ctx.i18n.t('toast.reset_done'), 'info');
            });
          }
        }
      },
      // Wire the KillSwitch toggles only when a real KillSwitch was
      // injected (the popup uses no-op stubs since it can't trip a
      // foreign content script's discovery anyway).
      setDiscoveryEnabled: killSwitch
        ? (on) => { void killSwitch.setDiscoveryEnabled(on); }
        : undefined,
      setHealthCheckEnabled: killSwitch
        ? (on) => { void killSwitch.setHealthCheckEnabled(on); }
        : undefined,
    });

    refreshDiagnosticStatus(settingsMenu, menuCtx);
    // Re-evaluate flip after the rerender -- modal width can change
    // when the active tab is swapped (Diagnostics tab is wider than
    // General). Cheap, runs only when the menu is open.
    adjustMenuPosition();
  }

  // Layout applier. Mirrors .user.js:4854-4894 (`applyLayout`) -- see the
  // `applyLayout` member below for the full rationale; that member just
  // delegates here.
  function applyLayoutImpl(): void {
    const pos = ctx.settingsStore.getKey('sliderPosition');
    root.dataset.vsSliderPosition = pos;

    const chrome =
      ctx.discovery.resolve('rightControls') ||
      ctx.discovery.resolve('controlsContainer');

    ctx.logger.info(
      `panel.applyLayout: pos=${pos} chrome=${chrome ? chrome.className : 'null'} sliderParent=${sliderContainer.parentElement?.className ?? '(orphan)'}`,
    );

    if (pos === 'video' && chrome) {
      sliderContainer.classList.add('vs-slider-in-chrome');
      if (sliderContainer.parentElement !== chrome
          || sliderContainer !== chrome.firstChild) {
        try {
          chrome.insertBefore(sliderContainer, chrome.firstChild);
          ctx.logger.info('panel.applyLayout: slider moved into chrome');
        }
        catch (e) { ctx.logger.warn('panel.applyLayout: chrome insert failed', e); }
      }
    } else {
      sliderContainer.classList.remove('vs-slider-in-chrome');
      if (sliderContainer.parentElement !== root
          || sliderContainer.nextSibling !== gearWrapper) {
        try {
          root.insertBefore(sliderContainer, gearWrapper);
          ctx.logger.info('panel.applyLayout: slider restored into panel');
        }
        catch (e) { ctx.logger.warn('panel.applyLayout: root insert failed', e); }
      }
    }
  }

  // Re-render whenever settings change (language switch, etc.) AND
  // re-apply layout if sliderPosition changed. The settings-menu handlers
  // already invoke ctx.ui.applyLayout() directly on radio click, but the
  // popup (and any future settings-source) updates the store without
  // touching the UiPort -- this subscriber covers that path. Comparing
  // against `lastPos` avoids re-running applyLayout on every unrelated
  // setting toggle (rememberSpeed, language, hotkeys, ...).
  let lastPos = ctx.settingsStore.getKey('sliderPosition');
  const offSubscribe = ctx.settingsStore.subscribe((next) => {
    if (next.sliderPosition !== lastPos) {
      lastPos = next.sliderPosition;
      applyLayoutImpl();
    }
    if (isMenuOpen()) {
      rerenderSettings();
    }
  });
  ctx.cleanup.add(offSubscribe);

  return {
    element: root,
    refreshButtons(speed) {
      refreshActiveButton(buttonsRow, speed);
    },
    refreshSlider(speed) {
      setSliderValue(sliderContainer, speed);
    },
    /** Public API: rerender the modal IF it's currently visible. Called
     *  by the health-checker subscriber in index.ts on every report; we
     *  no-op when the menu is hidden so the modal's rerender chain does
     *  not run continuously in the background. */
    rerenderSettings: () => {
      if (isMenuOpen()) {
        rerenderSettings();
      }
    },
    applyLayout: applyLayoutImpl,
    setGearWarning(on) {
      gearBtn.classList.toggle('has-warning', on);
    },
    dispose() {
      root.remove();
      sliderContainer.remove();
    },
  };
}
