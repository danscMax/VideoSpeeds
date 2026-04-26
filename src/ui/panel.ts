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
import { vsIcon } from './icons';
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
import { insertPanel } from './insertion';
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
  safeSetInnerHTML(gearBtn, vsIcon('settings', 16));

  const settingsMenu = document.createElement('div');
  settingsMenu.className = 'settings-menu';
  settingsMenu.style.display = 'none';
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
  ctx.cleanup.addEventListener(gearBtn, 'click', (event) => {
    event.stopPropagation();
    const isOpen = settingsMenu.style.display !== 'none';
    if (isOpen) {
      settingsMenu.style.display = 'none';
      settingsMenu.setAttribute('aria-hidden', 'true');
    } else {
      rerenderSettings();
      settingsMenu.style.display = '';
      settingsMenu.setAttribute('aria-hidden', 'false');
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
    if (settingsMenu.style.display === 'none') return;
    const target = event.target as Node | null;
    if (target && !gearWrapper.contains(target)) {
      settingsMenu.style.display = 'none';
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
  }

  // Re-render whenever settings change (language switch, etc.).
  const offSubscribe = ctx.settingsStore.subscribe(() => {
    if (settingsMenu.style.display !== 'none') {
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
      if (settingsMenu.style.display !== 'none') {
        rerenderSettings();
      }
    },
    applyLayout() {
      // 1. Update the data-attribute so the CSS rules keyed off
      //    [data-vs-slider-position="bottom"|"video"] take effect.
      root.dataset.vsSliderPosition = ctx.settingsStore.getKey('sliderPosition');
      // 2. Move the panel to the new anchor. insertPanel does the
      //    "remove from current parent + insert at new anchor" dance --
      //    so switching from `right` to `video` lifts the panel out of
      //    #primary-inner and drops it into .ytp-right-controls (and
      //    back). chooseAnchor reads sliderPosition from settings so no
      //    extra arg needed. Quiet on failure -- if the new anchor
      //    isn't present yet (player chrome not mounted), the
      //    orchestrator's removal-observer + retry path picks up the
      //    next opportunity.
      try {
        insertPanel(root, ctx);
      } catch (e) {
        ctx.logger.warn('panel.applyLayout: re-insert failed', e);
      }
    },
    dispose() {
      root.remove();
    },
  };
}
