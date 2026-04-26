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

import { handleSpeedButtonClick } from '../speed/controller';
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
import type { AppContext } from '../app/context';
import { CleanupRegistry } from '../app/cleanup';
import { speedBoundsFor } from '../config';

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
}

export function createPanel(opts: CreatePanelOptions): PanelHandle {
  const { ctx, scriptVersion } = opts;
  const presets = opts.presets ?? DEFAULT_PRESETS[ctx.site] ?? [1, 1.5, 2];
  const bounds = speedBoundsFor(ctx.site);

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
  const sliderInput = sliderContainer.querySelector<HTMLInputElement>('.speed-slider');
  if (sliderInput) {
    ctx.cleanup.addEventListener(sliderInput, 'input', () => {
      const value = parseFloat(sliderInput.value);
      if (Number.isFinite(value)) {
        updateSliderFill(sliderInput);
        // Use the speed controller so persistence + UI refresh stay
        // consistent. setTemporary is the right semantic for a drag
        // (continuous change), final position can be made global by
        // the user via settings/double-click on a button.
        void handleSpeedButtonClick(ctx, value);
      }
    });
  }

  // ----- Diagnostic counters (visible in DevTools console). Helps spot
  //       runaway render loops or handler-leak that would surface as
  //       "menu opens slowly / page freezes after click". -----
  let rerenderCount = 0;

  // ----- Menu-scoped cleanup registry. Disposed + replaced on every
  //       rerender so attachSettingsHandlers' ~25 listeners-per-render
  //       don't accumulate on the panel's main registry forever. The
  //       previous build leaked listeners to detached DOM nodes, which
  //       (combined with YouTube's deep DOM observers) plausibly drove
  //       the "everything freezes" symptom after a few interactions. -----
  let menuRegistry: CleanupRegistry | null = null;
  ctx.cleanup.add(() => {
    if (menuRegistry) {
      try { menuRegistry.dispose(); } catch { /* swallow */ }
      menuRegistry = null;
    }
  });

  // ----- Gear toggle -----
  ctx.cleanup.addEventListener(gearBtn, 'click', (event) => {
    const t0 = performance.now();
    event.stopPropagation();
    const isOpen = settingsMenu.style.display !== 'none';
    console.info('[VS:menu] gear-click start', { isOpen, t: t0.toFixed(1) });
    if (isOpen) {
      settingsMenu.style.display = 'none';
      settingsMenu.setAttribute('aria-hidden', 'true');
      console.info('[VS:menu] gear-click close', { dt_ms: (performance.now() - t0).toFixed(1) });
    } else {
      rerenderSettings('gear-open');
      settingsMenu.style.display = '';
      settingsMenu.setAttribute('aria-hidden', 'false');
      console.info('[VS:menu] gear-click open done', { dt_ms: (performance.now() - t0).toFixed(1) });
    }
  });

  // Stop clicks INSIDE the menu from bubbling to YouTube's body-level
  // click delegation (Polymer/React event delegate would otherwise
  // re-interpret tab/toggle clicks as host-page actions and open
  // their own popovers, which made the modal feel "frozen" -- ported
  // from .user.js:4758). Also keeps the document-close handler below
  // from firing on intra-menu clicks.
  ctx.cleanup.addEventListener(settingsMenu, 'click', (event) => {
    const target = (event.target as Element | null)?.tagName;
    console.info('[VS:menu] menu-click stopProp', { target });
    event.stopPropagation();
  });

  // Click outside the gear-wrapper closes the menu.
  ctx.cleanup.addEventListener(document, 'click', (event) => {
    if (settingsMenu.style.display === 'none') return;
    const target = event.target as Node | null;
    const insideWrapper = !!(target && gearWrapper.contains(target));
    console.info('[VS:menu] doc-click', {
      insideWrapper,
      targetTag: (target as Element | null)?.tagName,
      targetClass: (target as Element | null)?.className?.toString().slice(0, 60),
    });
    if (target && !insideWrapper) {
      settingsMenu.style.display = 'none';
      settingsMenu.setAttribute('aria-hidden', 'true');
      console.info('[VS:menu] doc-click closed menu');
    }
  });

  // ----- Settings re-renderer -----
  function rerenderSettings(reason: string = 'unknown'): void {
    rerenderCount += 1;
    const t0 = performance.now();
    console.info('[VS:menu] rerender start', { reason, n: rerenderCount });

    // Dispose the previous menu's listeners FIRST. This is what stops
    // listener accumulation on the main cleanup registry across many
    // rerenders.
    if (menuRegistry) {
      const sizesBefore = menuRegistry.sizes;
      menuRegistry.dispose();
      console.debug('[VS:menu] rerender:disposed previous menu registry', sizesBefore);
    }
    menuRegistry = new CleanupRegistry();
    const menuCtx: AppContext = { ...ctx, cleanup: menuRegistry };

    const html = renderSettingsMenu({
      settings: ctx.settingsStore.get(),
      site: ctx.site,
      i18n: ctx.i18n,
      activeTab,
      scriptVersion,
      discoveryEnabled: ctx.diagnostics.killSwitchEngaged() ? false : true,
      healthCheckEnabled: true,
    });
    const tBuilt = performance.now();
    console.info('[VS:menu] rerender:html-built', {
      bytes: html.length,
      dt_ms: (tBuilt - t0).toFixed(1),
    });

    safeSetInnerHTML(settingsMenu, html);
    const tHtml = performance.now();
    console.info('[VS:menu] rerender:innerHTML-set', {
      dt_ms: (tHtml - tBuilt).toFixed(1),
      childCount: settingsMenu.childElementCount,
    });

    attachSettingsHandlers(settingsMenu, menuCtx, {
      setActiveTab: (t) => {
        activeTab = t;
      },
      rerender: () => rerenderSettings('handler-rerender'),
      onDiag: (action) => {
        ctx.logger.info('diagnostics action', action);
        if (action === 'recheck') {
          refreshDiagnosticStatus(settingsMenu, menuCtx);
        }
      },
    });
    const tHandlers = performance.now();
    console.info('[VS:menu] rerender:handlers-attached', {
      dt_ms: (tHandlers - tHtml).toFixed(1),
      menu_cleanup: menuRegistry.sizes,
    });

    refreshDiagnosticStatus(settingsMenu, menuCtx);
    const tDiag = performance.now();
    console.info('[VS:menu] rerender done', {
      reason,
      n: rerenderCount,
      total_ms: (tDiag - t0).toFixed(1),
      diag_ms: (tDiag - tHandlers).toFixed(1),
      panel_cleanup: ctx.cleanup.sizes,
      menu_cleanup: menuRegistry.sizes,
    });
  }

  // Re-render whenever settings change (language switch, etc.).
  const offSubscribe = ctx.settingsStore.subscribe(() => {
    if (settingsMenu.style.display !== 'none') {
      console.info('[VS:menu] settings-subscribe -> rerender');
      rerenderSettings('settings-subscribe');
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
        rerenderSettings('public-api');
      }
    },
    applyLayout() {
      // Wave 1.8c stops at attribute-level reflow. Insertion-target swap
      // for sliderPosition='video' is wired by the orchestrator's insert
      // logic in Wave 1.10 (it knows the discovery context).
      root.dataset.vsSliderPosition = ctx.settingsStore.getKey('sliderPosition');
    },
    dispose() {
      root.remove();
    },
  };
}
