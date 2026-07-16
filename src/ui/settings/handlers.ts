/**
 * Settings modal handlers -- the only place outside the controller that
 * mutates settings. Every listener registers via ctx.cleanup so the
 * registry tears them down on dispose (audit C3).
 *
 * The host module gives us the modal root + a `rerender()` callback. We
 * never re-render from inside; we just update settings. The modal's
 * SettingsStore subscription drives the re-render externally.
 *
 * Ported from .user.js:4370-4615 (attachSettingsHandlers).
 */

import { browser } from 'wxt/browser';
import type { AppContext } from '../../app/context';
import { defaultPresetsFor } from '../../config';
import type { Lang } from '../../i18n/dict';
import { captureHotkey, formatHotkey, isBrowserReservedCombo } from '../../speed/hotkeys';
import { applyVolumeBoost, clampBoost } from '../../speed/volume-boost';
import { defaultSettings, type Hotkey, type SliderPosition } from '../../storage/types';
import { refreshDiagnosticStatus } from './diag-status';
import { exportSettingsToFile, openImportPicker } from './export-import';
import type { HotkeyAction } from './hotkey-block';
import type { ActiveTab } from './modal';

/** All hotkey actions a settings row can address. Used to validate the
 *  data-* attributes coming back from the DOM. */
const HOTKEY_ACTIONS: readonly HotkeyAction[] = [
  'speedUp',
  'speedDown',
  'resetSpeed',
  'toggleLast',
  'seekForward',
  'seekBack',
];

function asHotkeyAction(raw: string | undefined): HotkeyAction | undefined {
  return HOTKEY_ACTIONS.includes(raw as HotkeyAction) ? (raw as HotkeyAction) : undefined;
}

/** Live hotkeys with the optional actions normalised to arrays. */
function hotkeyArrayOf(
  hotkeys: { [K in HotkeyAction]?: readonly Hotkey[] },
  action: HotkeyAction,
): readonly Hotkey[] {
  return hotkeys[action] ?? [];
}

/**
 * Open the in-extension feedback page in a new tab.
 *
 * Audit 2026-05-11: route through the background SW. From content-
 * script context, `window.open(chrome-extension://feedback.html)` is
 * silently dropped — the page's window (origin youtube.com /
 * rutube.ru) is the navigation initiator and the target URL is not
 * in `web_accessible_resources`, so the browser refuses. Asking the
 * background SW to call `browser.tabs.create` works because the SW
 * owns chrome.tabs and is allowed to open extension URLs without
 * the `tabs` permission.
 *
 * From the toolbar popup the same handler runs but the popup's own
 * origin matches the extension's, so the message-then-tabs-create
 * indirection is technically unnecessary there. We use it uniformly
 * to keep one call path.
 *
 * The synchronous user-gesture is consumed by sendMessage; the
 * background create-tab happens after the SW responds, which loses
 * the gesture chain — but Chrome lets extension SWs open tabs
 * unconditionally so the popup-blocker doesn't apply.
 */
function openFeedbackPage(attachDiagnostics = false): void {
  // UX-029: ?attach=1 tells feedback.html to pre-enable the
  // "attach diagnostic report" checkbox.
  const path = attachDiagnostics ? '/feedback.html?attach=1' : '/feedback.html';
  void browser.runtime
    .sendMessage({ type: 'open-extension-page', path })
    .then((res: unknown) => {
      const ok = !!(res && typeof res === 'object' && (res as { ok?: boolean }).ok);
      if (!ok) {
        console.warn('[VIDEO-SPEEDS] background did not open feedback tab', res);
      }
    })
    .catch((e: unknown) => {
      console.warn('[VIDEO-SPEEDS] Failed to open feedback page', e);
    });
}

export interface SettingsHandlersDeps {
  /** Update which tab is rendered next time. The host re-renders. */
  setActiveTab: (tab: ActiveTab) => void;
  /** Notify host that the modal needs a fresh paint. */
  rerender: () => void;
  /** Discovery cache + diag actions delegate to these. */
  onDiag: (action: 'recheck' | 'copy' | 'purge-cache' | 'full-reset') => void;
  /** Optional toggles for KillSwitch (Wave 1.9). */
  setDiscoveryEnabled?: (on: boolean) => void;
  setHealthCheckEnabled?: (on: boolean) => void;
}

/** UX-026: inline error state on a field — red ring via .vs-input-error
 *  plus aria-invalid. Cleared as soon as the user edits the value. */
function flagInvalid(el: HTMLElement | null | undefined, on: boolean): void {
  if (!el) return;
  el.classList.toggle('vs-input-error', on);
  if (on) el.setAttribute('aria-invalid', 'true');
  else el.removeAttribute('aria-invalid');
}

export function attachSettingsHandlers(
  menuRoot: Element,
  ctx: AppContext,
  deps: SettingsHandlersDeps,
): void {
  // ----- Tabs -----
  for (const btn of Array.from(menuRoot.querySelectorAll<HTMLButtonElement>('[data-vs-tab]'))) {
    ctx.cleanup.addEventListener(btn, 'click', () => {
      const tab = btn.dataset.vsTab as ActiveTab | undefined;
      if (!tab) return;
      deps.setActiveTab(tab);
      deps.rerender();
      // Auto-refresh diagnostics when user switches TO that tab so they
      // see fresh status instead of "Not checked yet" stale text.
      // Mirror .user.js:4385 (audit C3.1). The rerender above wipes
      // the old DOM, so the refresh must run AFTER it: schedule into
      // the next frame to land on the freshly-rendered nodes.
      if (tab === 'diag') {
        requestAnimationFrame(() => refreshDiagnosticStatus(menuRoot, ctx));
      }
    });
  }

  // ----- Slider position (segmented control) -----
  // preventDefault + stopPropagation match .user.js:4392-4393. Without
  // them, YouTube's body-level click delegation occasionally swallowed
  // the click before our async update completed (the panel-level
  // settingsMenu.stopPropagation runs AFTER us in capture order, so
  // handler-local stop is the safe place).
  for (const btn of Array.from(menuRoot.querySelectorAll<HTMLButtonElement>('[data-vs-pos]'))) {
    ctx.cleanup.addEventListener(btn, 'click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const pos = btn.dataset.vsPos as SliderPosition | undefined;
      ctx.logger.info(`settings: sliderPosition click pos=${pos ?? '(missing)'}`);
      if (pos) {
        await ctx.settingsStore.update({ sliderPosition: pos });
        ctx.ui.applyLayout();
        // Audit 2026-05-09 perf P3: removed redundant deps.rerender() —
        // the panel's settingsStore subscriber already calls
        // rerenderSettings() when the menu is open. Keeping it here
        // caused a double full-modal rebuild per click.
      }
    });
  }

  // ----- Speed preset toggles -----
  //
  // Click a pill to add / remove that speed from the visible button row.
  // We refuse to leave the user with zero presets — clicking the last
  // active pill is a no-op (visual nudge only). The reset button below
  // restores the per-site defaults via defaultPresetsFor().
  for (const btn of Array.from(menuRoot.querySelectorAll<HTMLButtonElement>('[data-vs-preset]'))) {
    ctx.cleanup.addEventListener(btn, 'click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const raw = btn.dataset.vsPreset;
      const value = raw ? parseFloat(raw) : NaN;
      if (!Number.isFinite(value)) return;
      const current = ctx.settingsStore.getKey('speedPresets') ?? [];
      const has = current.some((v) => Math.abs(v - value) < 0.005);
      let next: number[];
      if (has) {
        if (current.length <= 1) {
          // Block "remove all" — keep at least one preset on the panel.
          ctx.ui.showNotification(ctx.i18n.t('toast.shortcut_min'), 'warn');
          return;
        }
        next = current.filter((v) => Math.abs(v - value) >= 0.005);
      } else {
        next = [...current, value].sort((a, b) => a - b);
      }
      await ctx.settingsStore.update({ speedPresets: next });
      // Audit 2026-05-09 perf P3: subscriber handles rerender.
    });
  }
  const presetReset = menuRoot.querySelector<HTMLButtonElement>('[data-vs-preset-reset]');
  if (presetReset) {
    ctx.cleanup.addEventListener(presetReset, 'click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      // UX-025: confirm only when the click would actually discard a
      // customised list — resetting an already-default list stays silent.
      const defaults = [...defaultPresetsFor(ctx.site)];
      const current = ctx.settingsStore.getKey('speedPresets') ?? [];
      const differs = JSON.stringify([...current].sort()) !== JSON.stringify([...defaults].sort());
      if (differs && typeof window.confirm === 'function') {
        if (!window.confirm(ctx.i18n.t('confirm.reset_partial'))) return;
      }
      await ctx.settingsStore.update({ speedPresets: defaults });
    });
  }

  // ----- Custom speed input (manual entry) -----
  //
  // The pool covers conventional values (0.5..4 in 0.25 steps); a power
  // user wanting 5x / 7x / 10x types it here. Validation gates:
  //   - finite, positive number (rejects '', NaN, negatives)
  //   - within the absolute soft cap [0.5, 10] regardless of site bounds
  //   - rounded to 2 decimals
  //   - not a duplicate of an existing preset (within 0.005)
  // On any failure we toast a localised reason and keep the input as-is
  // so the user can edit and retry.
  const presetInput = menuRoot.querySelector<HTMLInputElement>('[data-vs-preset-input]');
  const presetAdd = menuRoot.querySelector<HTMLButtonElement>('[data-vs-preset-add]');
  const ABSOLUTE_MIN = 0.5;
  const ABSOLUTE_MAX = 10;
  async function trySubmitCustom(): Promise<void> {
    if (!presetInput) return;
    const raw = presetInput.value.trim();
    if (!raw) return; // empty submit — silent no-op
    const parsed = parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      flagInvalid(presetInput, true);
      ctx.ui.showNotification(ctx.i18n.t('toast.preset_invalid'), 'error');
      return;
    }
    if (parsed < ABSOLUTE_MIN || parsed > ABSOLUTE_MAX) {
      flagInvalid(presetInput, true);
      ctx.ui.showNotification(
        ctx.i18n.t('toast.preset_out_of_range', { min: ABSOLUTE_MIN, max: ABSOLUTE_MAX }),
        'error',
      );
      return;
    }
    const value = Math.round(parsed * 100) / 100;
    const current = ctx.settingsStore.getKey('speedPresets') ?? [];
    if (current.some((v) => Math.abs(v - value) < 0.005)) {
      flagInvalid(presetInput, true);
      ctx.ui.showNotification(ctx.i18n.t('toast.preset_duplicate'), 'warn');
      return;
    }
    flagInvalid(presetInput, false);
    const next = [...current, value].sort((a, b) => a - b);
    await ctx.settingsStore.update({ speedPresets: next });
    presetInput.value = '';
    // Audit 2026-05-09 perf P3: subscriber handles rerender.
  }
  if (presetAdd) {
    ctx.cleanup.addEventListener(presetAdd, 'click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await trySubmitCustom();
    });
  }
  if (presetInput) {
    ctx.cleanup.addEventListener(presetInput, 'keydown', async (event) => {
      const ev = event as KeyboardEvent;
      if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        await trySubmitCustom();
      }
    });
    // UX-026: editing clears the error ring immediately.
    ctx.cleanup.addEventListener(presetInput, 'input', () => {
      flagInvalid(presetInput, false);
    });
  }

  // ----- Slider range (Min / Max) -----
  //
  // Two number inputs that override the per-site slider bounds. Empty
  // input ⇒ "use site default" (we write `undefined` to settings, and
  // the panel falls back via resolveSliderRange()). Validation:
  //   - parse number; reject NaN/empty as "clear" (writes undefined)
  //   - within (0, 10] absolute caps
  //   - sliderMin must be < sliderMax (cross-field check)
  // The panel subscribes to settings and patches the live slider in-place
  // via setSliderRange — no rebuild needed.
  const sliderMinInput = menuRoot.querySelector<HTMLInputElement>('[data-vs-slider-min]');
  const sliderMaxInput = menuRoot.querySelector<HTMLInputElement>('[data-vs-slider-max]');
  const sliderRangeReset = menuRoot.querySelector<HTMLButtonElement>(
    '[data-vs-slider-range-reset]',
  );

  function parseSliderRangeValue(raw: string): number | undefined {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const parsed = parseFloat(trimmed.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10) return undefined;
    return Math.round(parsed * 100) / 100;
  }

  async function commitSliderRange(): Promise<void> {
    const rawMin = sliderMinInput?.value ?? '';
    const rawMax = sliderMaxInput?.value ?? '';
    const min = parseSliderRangeValue(rawMin);
    const max = parseSliderRangeValue(rawMax);
    // Cross-field: if both present and min >= max, drop both with a toast.
    if (typeof min === 'number' && typeof max === 'number' && min >= max) {
      flagInvalid(sliderMinInput, true);
      flagInvalid(sliderMaxInput, true);
      ctx.ui.showNotification(ctx.i18n.t('toast.slider_range_invalid'), 'error');
      return;
    }
    flagInvalid(sliderMinInput, false);
    flagInvalid(sliderMaxInput, false);
    await ctx.settingsStore.update({ sliderMin: min, sliderMax: max });
  }

  if (sliderMinInput) {
    ctx.cleanup.addEventListener(sliderMinInput, 'change', () => {
      void commitSliderRange();
    });
    ctx.cleanup.addEventListener(sliderMinInput, 'input', () => {
      flagInvalid(sliderMinInput, false);
      flagInvalid(sliderMaxInput, false);
    });
  }
  if (sliderMaxInput) {
    ctx.cleanup.addEventListener(sliderMaxInput, 'change', () => {
      void commitSliderRange();
    });
    ctx.cleanup.addEventListener(sliderMaxInput, 'input', () => {
      flagInvalid(sliderMinInput, false);
      flagInvalid(sliderMaxInput, false);
    });
  }
  if (sliderRangeReset) {
    ctx.cleanup.addEventListener(sliderRangeReset, 'click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await ctx.settingsStore.update({ sliderMin: undefined, sliderMax: undefined });
      // Audit 2026-05-09 perf P3: subscriber handles rerender.
    });
  }

  // ----- Language switcher -----
  for (const btn of Array.from(menuRoot.querySelectorAll<HTMLButtonElement>('[data-vs-lang]'))) {
    ctx.cleanup.addEventListener(btn, 'click', async () => {
      const lang = btn.dataset.vsLang as Lang | undefined;
      if (lang === 'en' || lang === 'ru') {
        await ctx.settingsStore.update({ language: lang });
        ctx.ui.showNotification(ctx.i18n.t('toast.lang_switched'), 'info');
      }
    });
  }

  // ----- Behavior toggles -----
  attachToggle(menuRoot, ctx, 'remember-speed', 'rememberSpeed');
  // UX-031: compact mode re-applies layout immediately so the panel
  // collapses/expands without waiting for the next navigation.
  attachToggle(menuRoot, ctx, 'compact-mode', 'compactMode', () => {
    ctx.ui.applyLayout();
  });
  // FEAT-013: pitch preservation — applied on the next speed write.
  attachToggle(menuRoot, ctx, 'preserve-pitch', 'preservePitch');
  // FEAT-015: per-content speed memory.
  attachToggle(menuRoot, ctx, 'remember-per-video', 'rememberPerVideo');
  // FEAT-016: show/hide the "finish N earlier" badge. Panel subscribes to the
  // store and reflects the change live.
  attachToggle(menuRoot, ctx, 'show-time-saved', 'showTimeSaved');
  attachToggle(menuRoot, ctx, 'hide-player-title', 'hidePlayerTitle');
  attachToggle(menuRoot, ctx, 'hide-premium', 'hidePremium');

  // ----- Discovery / healthcheck (KillSwitch wiring -- Wave 1.9) -----
  const discoveryCb = menuRoot.querySelector<HTMLInputElement>('input[name="discovery-enabled"]');
  if (discoveryCb && deps.setDiscoveryEnabled) {
    ctx.cleanup.addEventListener(discoveryCb, 'change', () => {
      deps.setDiscoveryEnabled?.(discoveryCb.checked);
      ctx.ui.showNotification(
        ctx.i18n.t(discoveryCb.checked ? 'toast.discovery_on' : 'toast.discovery_off'),
        'info',
      );
    });
  }
  const healthCb = menuRoot.querySelector<HTMLInputElement>('input[name="healthcheck-enabled"]');
  if (healthCb && deps.setHealthCheckEnabled) {
    ctx.cleanup.addEventListener(healthCb, 'change', () => {
      deps.setHealthCheckEnabled?.(healthCb.checked);
      ctx.ui.showNotification(
        ctx.i18n.t(healthCb.checked ? 'toast.healthcheck_on' : 'toast.healthcheck_off'),
        'info',
      );
    });
  }

  // ----- Hotkey capture (focus on input -> next keydown becomes the new combo) -----
  for (const input of Array.from(menuRoot.querySelectorAll<HTMLInputElement>('.vs-hotkey-input'))) {
    const row = input.closest<HTMLElement>('.vs-hotkey-row');
    if (!row) continue;
    const action = asHotkeyAction(row.dataset.hotkeyType);
    const slotIndex = Number(row.dataset.slotIndex);
    if (!action || Number.isNaN(slotIndex)) continue;

    // Visual capture cue (audit B3.2): toggle .capturing on focus so
    // the CSS pulse animation (vs-capture-pulse keyframe) fires while
    // the input is listening. Mirror .user.js:4421-4427.
    // UX-006: while capturing, swap the value for a "Press keys…"
    // placeholder — focus alone read as "selected", not "listening".
    ctx.cleanup.addEventListener(input, 'focus', () => {
      input.classList.add('capturing');
      input.dataset.vsPrevValue = input.value;
      input.value = '';
      input.placeholder = ctx.i18n.t('hotkeys.listening');
    });
    ctx.cleanup.addEventListener(input, 'blur', () => {
      input.classList.remove('capturing');
      // No capture happened (Esc/Tab/click-away) — restore the old combo.
      if (input.value === '' && input.dataset.vsPrevValue) {
        input.value = input.dataset.vsPrevValue;
      }
      delete input.dataset.vsPrevValue;
      input.placeholder = ctx.i18n.t('hotkeys.placeholder');
    });

    // Audit 2026-05-09 sec C15: avoid concurrent hotkey writes. The
    // previous async handler `await`ed update() while the input was
    // still focused; if the user pressed another key during the
    // in-flight write, both keydowns sliced from a stale snapshot of
    // `hotkeys` and the second await clobbered the first capture
    // (silent loss). The `dataset.busy` guard short-circuits re-entry
    // and the input is blurred synchronously so further keys go to
    // the page until the persist settles.
    ctx.cleanup.addEventListener(input, 'keydown', (event) => {
      const ev = event as KeyboardEvent;
      if (ev.key === 'Escape' || ev.key === 'Tab') {
        input.blur();
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      if (input.dataset.vsBusy === '1') return;
      const hk = captureHotkey(ev);
      // Skip pure-modifier presses ("ControlLeft" etc.).
      if (/^(Control|Shift|Alt|Meta)/.test(hk.key)) return;
      input.dataset.vsBusy = '1';
      // Capture and update the input synchronously so the user sees
      // the result immediately even if the persist is slow.
      input.value = formatHotkey(hk);
      input.classList.remove('capturing');
      input.blur();
      // UX-024: warn (don't block) when the combo collides with a
      // common browser/system shortcut — the binding still works, but
      // the user should know they're giving up native copy/paste etc.
      if (isBrowserReservedCombo(hk)) {
        ctx.ui.showNotification(
          ctx.i18n.t('toast.hotkey_reserved', { combo: formatHotkey(hk) }),
          'warn',
        );
      }
      const liveHotkeys = ctx.settingsStore.getKey('hotkeys');
      const arr = hotkeyArrayOf(liveHotkeys, action).slice();
      arr[slotIndex] = hk;
      ctx.settingsStore
        .update({ hotkeys: { ...liveHotkeys, [action]: arr } })
        .catch((e) => {
          ctx.logger.error('handlers: hotkey persist failed', e);
        })
        .finally(() => {
          delete input.dataset.vsBusy;
          // Audit 2026-05-09 perf P3: subscriber handles rerender on
          // success; on rollback (audit C9) it also fires. No need
          // for an explicit rerender here.
        });
    });
  }

  // ----- Hotkey add / remove / reset -----
  for (const btn of Array.from(
    menuRoot.querySelectorAll<HTMLButtonElement>('[data-vs-hotkey-add]'),
  )) {
    ctx.cleanup.addEventListener(btn, 'click', async () => {
      const action = asHotkeyAction(btn.dataset.vsHotkeyAdd);
      if (!action) return;
      const live = ctx.settingsStore.getKey('hotkeys');
      const next = {
        ...live,
        [action]: [
          ...hotkeyArrayOf(live, action),
          // New empty slot — empty key string renders as a placeholder
          // input ("Кликните и нажмите клавиши..."), and never matches
          // a real keypress until the user fills it in. Auto-focus
          // below puts the input in capture-state immediately so the
          // user just presses keys.
          { ctrl: false, shift: false, alt: false, meta: false, key: '' } as Hotkey,
        ],
      };
      await ctx.settingsStore.update({ hotkeys: next });
      // Subscriber rerenders synchronously in update(); the rAF below
      // lands in the next frame after that rerender (audit P3).
      requestAnimationFrame(() => {
        const inputs = menuRoot.querySelectorAll<HTMLInputElement>(
          `.vs-hotkey-row[data-hotkey-type="${action}"] .vs-hotkey-input`,
        );
        const last = inputs[inputs.length - 1];
        last?.focus();
      });
    });
  }

  for (const btn of Array.from(
    menuRoot.querySelectorAll<HTMLButtonElement>('[data-vs-hotkey-remove]'),
  )) {
    ctx.cleanup.addEventListener(btn, 'click', async () => {
      const row = btn.closest<HTMLElement>('.vs-hotkey-row');
      if (!row) return;
      const action = asHotkeyAction(row.dataset.hotkeyType);
      const slotIndex = Number(row.dataset.slotIndex);
      if (!action || Number.isNaN(slotIndex)) return;
      const live = ctx.settingsStore.getKey('hotkeys');
      const existing = hotkeyArrayOf(live, action);
      // The two core actions must keep at least one combo; the optional
      // quick-actions (reset/toggle/seek) may be emptied entirely.
      const isCore = action === 'speedUp' || action === 'speedDown';
      if (isCore && existing.length <= 1) {
        ctx.ui.showNotification(ctx.i18n.t('toast.shortcut_min'), 'warn');
        return;
      }
      const arr = existing.slice();
      arr.splice(slotIndex, 1);
      await ctx.settingsStore.update({ hotkeys: { ...live, [action]: arr } });
      // Audit 2026-05-09 perf P3: subscriber handles rerender.
    });
  }

  for (const btn of Array.from(
    menuRoot.querySelectorAll<HTMLButtonElement>('[data-vs-hotkey-reset]'),
  )) {
    ctx.cleanup.addEventListener(btn, 'click', async () => {
      const action = asHotkeyAction(btn.dataset.vsHotkeyReset);
      if (!action) return;
      const fresh = defaultSettings(ctx.settingsStore.getKey('language')).hotkeys;
      const live = ctx.settingsStore.getKey('hotkeys');
      const freshArr = hotkeyArrayOf(fresh, action);
      // UX-025: confirm only when discarding actual customisation.
      const differs = JSON.stringify(hotkeyArrayOf(live, action)) !== JSON.stringify(freshArr);
      if (differs && typeof window.confirm === 'function') {
        if (!window.confirm(ctx.i18n.t('confirm.reset_partial'))) return;
      }
      await ctx.settingsStore.update({
        hotkeys: { ...live, [action]: [...freshArr] },
      });
      // Audit 2026-05-09 perf P3: subscriber handles rerender.
    });
  }

  // ----- FEAT-022: one-click preset profiles -----
  const PRESET_PROFILES: Record<string, number[]> = {
    movies: [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2],
    lectures: [1, 1.5, 2, 2.5, 3],
    minimal: [1, 1.5, 2],
  };
  for (const btn of Array.from(
    menuRoot.querySelectorAll<HTMLButtonElement>('[data-vs-preset-profile]'),
  )) {
    ctx.cleanup.addEventListener(btn, 'click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const profile = PRESET_PROFILES[btn.dataset.vsPresetProfile ?? ''];
      if (!profile) return;
      const current = ctx.settingsStore.getKey('speedPresets') ?? [];
      const differs = JSON.stringify([...current].sort()) !== JSON.stringify([...profile].sort());
      if (!differs) return;
      // Replacing a hand-customised list is destructive — confirm first.
      if (typeof window.confirm === 'function') {
        if (!window.confirm(ctx.i18n.t('confirm.reset_partial'))) return;
      }
      await ctx.settingsStore.update({ speedPresets: [...profile] });
    });
  }

  // ----- FEAT-017: volume boost -----
  const boostInput = menuRoot.querySelector<HTMLInputElement>('[data-vs-volume-boost]');
  if (boostInput) {
    ctx.cleanup.addEventListener(boostInput, 'change', async () => {
      const parsed = parseFloat(boostInput.value.replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed < 100 || parsed > 300) {
        flagInvalid(boostInput, true);
        ctx.ui.showNotification(ctx.i18n.t('toast.preset_invalid'), 'error');
        return;
      }
      flagInvalid(boostInput, false);
      const gain = clampBoost(parsed / 100);
      await ctx.settingsStore.update({ volumeBoost: gain });
      // Apply immediately to the live video (the change-event IS the
      // user gesture Web Audio needs to start).
      const v = ctx.discovery.resolve('video');
      if (v instanceof HTMLVideoElement) {
        const ok = applyVolumeBoost(v, gain, ctx.logger);
        if (!ok) {
          ctx.ui.showNotification(ctx.i18n.t('toast.volume_boost_failed'), 'warn');
        }
      }
    });
    ctx.cleanup.addEventListener(boostInput, 'input', () => {
      flagInvalid(boostInput, false);
    });
  }

  // ----- FEAT-018: hotkey speed step -----
  const stepInput = menuRoot.querySelector<HTMLInputElement>('[data-vs-speed-step]');
  if (stepInput) {
    ctx.cleanup.addEventListener(stepInput, 'change', async () => {
      const parsed = parseFloat(stepInput.value.replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed < 0.01 || parsed > 1) {
        flagInvalid(stepInput, true);
        ctx.ui.showNotification(ctx.i18n.t('toast.preset_invalid'), 'error');
        return;
      }
      flagInvalid(stepInput, false);
      await ctx.settingsStore.update({ speedStep: Math.round(parsed * 100) / 100 });
    });
    ctx.cleanup.addEventListener(stepInput, 'input', () => {
      flagInvalid(stepInput, false);
    });
  }

  // ----- FEAT-014: seek step (seconds) -----
  const seekInput = menuRoot.querySelector<HTMLInputElement>('[data-vs-seek-seconds]');
  if (seekInput) {
    ctx.cleanup.addEventListener(seekInput, 'change', async () => {
      const parsed = parseFloat(seekInput.value.replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 120) {
        flagInvalid(seekInput, true);
        ctx.ui.showNotification(ctx.i18n.t('toast.preset_invalid'), 'error');
        return;
      }
      flagInvalid(seekInput, false);
      await ctx.settingsStore.update({ seekSeconds: Math.round(parsed) });
    });
    ctx.cleanup.addEventListener(seekInput, 'input', () => {
      flagInvalid(seekInput, false);
    });
  }

  // ----- Diagnostics actions -----
  for (const btn of Array.from(menuRoot.querySelectorAll<HTMLButtonElement>('[data-vs-diag]'))) {
    ctx.cleanup.addEventListener(btn, 'click', () => {
      const action = btn.dataset.vsDiag;
      if (action === 'feedback') {
        openFeedbackPage(btn.dataset.vsFeedbackAttach === '1');
        return;
      }
      if (
        action === 'recheck' ||
        action === 'copy' ||
        action === 'purge-cache' ||
        action === 'full-reset'
      ) {
        deps.onDiag(action);
      }
    });
  }

  // ----- Export / Import -----
  const exportBtn = menuRoot.querySelector<HTMLButtonElement>('[data-vs-action="export"]');
  if (exportBtn) {
    ctx.cleanup.addEventListener(exportBtn, 'click', () => {
      exportSettingsToFile(ctx);
    });
  }
  const importBtn = menuRoot.querySelector<HTMLButtonElement>('[data-vs-action="import"]');
  if (importBtn) {
    ctx.cleanup.addEventListener(importBtn, 'click', () => {
      openImportPicker(ctx, (result) => {
        if (result.ok) {
          ctx.ui.showNotification(ctx.i18n.t('settings.import.success'), 'info');
          // Audit 2026-05-09 perf P3: subscriber handles rerender.
        } else if (result.cancelled) {
          // UX-032: user declined the preview — not an error.
          ctx.ui.showNotification(ctx.i18n.t('toast.import_cancelled'), 'info');
        } else {
          ctx.ui.showNotification(
            ctx.i18n.t('settings.import.failure', { message: result.message ?? 'unknown' }),
            'error',
          );
        }
      });
    });
  }
}

function attachToggle(
  menuRoot: Element,
  ctx: AppContext,
  inputName: string,
  settingKey:
    | 'rememberSpeed'
    | 'hidePlayerTitle'
    | 'hidePremium'
    | 'compactMode'
    | 'preservePitch'
    | 'rememberPerVideo'
    | 'showTimeSaved',
  onChanged?: () => void,
): void {
  const cb = menuRoot.querySelector<HTMLInputElement>(`input[name="${inputName}"]`);
  if (!cb) return;
  ctx.cleanup.addEventListener(cb, 'change', async () => {
    await ctx.settingsStore.update({ [settingKey]: cb.checked } as never);
    onChanged?.();
    if (settingKey === 'hidePlayerTitle') {
      ctx.ui.showNotification(
        ctx.i18n.t(cb.checked ? 'toast.title_hidden' : 'toast.title_shown'),
        'info',
      );
    } else if (settingKey === 'hidePremium') {
      ctx.ui.showNotification(
        ctx.i18n.t(cb.checked ? 'toast.premium_hidden' : 'toast.premium_shown'),
        'info',
      );
    }
  });
}
