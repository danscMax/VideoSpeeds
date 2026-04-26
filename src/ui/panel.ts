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
    safeSetInnerHTML(
      settingsMenu,
      renderSettingsMenu({
        settings: ctx.settingsStore.get(),
        site: ctx.site,
        i18n: ctx.i18n,
        activeTab,
        scriptVersion,
        discoveryEnabled: ctx.diagnostics.killSwitchEngaged() ? false : true,
        healthCheckEnabled: true,
      }),
    );
    attachSettingsHandlers(settingsMenu, ctx, {
      setActiveTab: (t) => {
        activeTab = t;
      },
      rerender: rerenderSettings,
      onDiag: (action) => {
        // Wave 1.9 will wire these to HealthChecker/KillSwitch. For now we
        // just log so the rest of the UI keeps working end-to-end.
        ctx.logger.info('diagnostics action', action);
        if (action === 'recheck') {
          refreshDiagnosticStatus(settingsMenu, ctx);
        }
      },
    });
    refreshDiagnosticStatus(settingsMenu, ctx);
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
    rerenderSettings,
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
