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

import { CleanupRegistry } from '../app/cleanup';
import type { AppContext } from '../app/context';
import { defaultPresetsFor, speedBoundsFor } from '../config';
import {
  applyTransient,
  handleSpeedButtonClick,
  setGlobal,
  setTemporary,
} from '../speed/controller';
import { refreshActiveButton, refreshPinnedButton, renderButtonsRow } from './buttons';
import { vsFilledGearIcon, vsIcon } from './icons';
import { disposeNotificationStack } from './notifications';
import { disposeSpeedPopup } from './popup';
import { refreshDiagnosticStatus } from './settings/diag-status';
import { attachSettingsHandlers } from './settings/handlers';
import { type ActiveTab, renderSettingsMenu } from './settings/modal';
import { renderSlider, setSliderRange, setSliderValue, updateSliderFill } from './slider';

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

/**
 * Reveal the panel after the host page finishes its initial loading
 * skeleton. YouTube/RuTube render placeholder boxes during the first
 * few hundred ms with CSS that occasionally clips children of the
 * column we mount into — visually the bottom of our pill buttons gets
 * cropped until the skeleton ends. Audit 2026-05-10.
 *
 * Reveal whichever fires first:
 *   - host signal: site-specific "metadata column hydrated" check
 *     • YouTube: ytd-watch-metadata is rendered AND its h1 has text
 *       AND the skeleton loader is gone
 *     • RuTube/other: reveal immediately — the cropping issue is
 *       YouTube-specific (skeleton overflow:hidden on parent column)
 *   - hard 3000 ms timeout (worst-case fallback — never permanently
 *     hidden, but long enough to wait out a slow YT hydration)
 *
 * Audit 2026-05-10b: removed the window.load + 100 ms fallback. On
 * YouTube `load` fires BEFORE the SPA finishes hydrating the metadata
 * column (it's an SPA — initial document is mostly empty), so the
 * 100 ms grace was triggering reveal while the column was still in
 * skeleton state, exactly when our pill buttons get clipped. Now we
 * trust only the title-element-has-text signal (observed via
 * MutationObserver) plus a hard ceiling so we don't lock the panel
 * away forever if the title heuristic fails.
 */
function scheduleHostHydrationReveal(root: HTMLElement, ctx: AppContext): void {
  // Non-YouTube sites: the cropping artifact is YouTube-specific
  // (caused by YT's loading-skeleton overflow:hidden on #primary-inner
  // during SPA hydration). RuTube renders its layout synchronously
  // and doesn't exhibit the issue, so deferring would only delay a
  // fully-correct render. Reveal immediately.
  if (ctx.site !== 'youtube') {
    root.classList.remove('vs-panel--pending');
    return;
  }

  let revealed = false;
  const reveal = (): void => {
    if (revealed) return;
    revealed = true;
    root.classList.remove('vs-panel--pending');
  };

  const checkYtHydrated = (): boolean => {
    try {
      // YT renders ytd-watch-metadata's h1 only AFTER its metadata
      // API call resolves — this is the same moment the skeleton
      // shimmer placeholders disappear. textContent is empty during
      // skeleton, populated when the column lays out for real, so
      // a single text-content check is sufficient and version-stable.
      const t = document.querySelector('ytd-watch-metadata h1');
      if (t && (t.textContent ?? '').trim().length > 0) {
        reveal();
        return true;
      }
    } catch {
      /* swallow */
    }
    return false;
  };

  if (checkYtHydrated()) return;

  // Audit 2026-05-11 W2.5 (PERF-003 + REL-007): scope the observer to
  // the metadata column when present (ytd-watch-metadata or
  // #primary-inner). YouTube fires thousands of mutations during cold
  // load across the body subtree (recommendations cards, ad slots,
  // comments hydrating, polymer reactions); previously every one of
  // them triggered our checkYtHydrated() with its querySelector +
  // textContent read. Narrowing to the metadata container leaves
  // <body> as fallback for the early-bootstrap window where neither
  // container exists yet.
  const observeTarget =
    document.querySelector('ytd-watch-metadata') ??
    document.getElementById('primary-inner') ??
    document.body;
  let mo: MutationObserver | null = null;
  try {
    mo = new MutationObserver(() => {
      if (checkYtHydrated()) {
        mo?.disconnect();
        mo = null;
      }
    });
    mo.observe(observeTarget, { childList: true, subtree: true });
    ctx.cleanup.add(() => {
      try {
        mo?.disconnect();
      } catch {
        /* swallow */
      }
    });
  } catch {
    /* swallow — observer unavailable in unit-test env, fall through to timer */
  }

  // Hard ceiling. Even if both heuristics above fail to fire, the
  // panel becomes visible after 3000 ms — slightly later than ideal
  // but never permanently hidden. 3 s is a deliberate raise from
  // 1.5 s: on slow connections YT's metadata API can take longer
  // than 1.5 s, and the previous timeout was firing before the
  // skeleton ended on those.
  ctx.cleanup.setTimeout(() => {
    reveal();
    mo?.disconnect();
    mo = null;
  }, 3000);
}

export function createPanel(opts: CreatePanelOptions): PanelHandle {
  const { ctx, scriptVersion } = opts;
  const bounds = speedBoundsFor(ctx.site);
  const killSwitch = opts.killSwitch;
  const diagActions = opts.diagActions;

  /**
   * Resolve the current preset list. User can customise via Settings →
   * General → "Speed buttons", which writes to `Settings.speedPresets`.
   * Falls back to the per-site default if the explicit `opts.presets`
   * override is absent AND the user's settings list is empty (which can
   * happen after a botched import or a "remove all" click).
   */
  const resolvePresets = (): readonly number[] => {
    if (opts.presets && opts.presets.length > 0) return opts.presets;
    const stored = ctx.settingsStore.getKey('speedPresets');
    if (Array.isArray(stored) && stored.length > 0) return stored;
    return defaultPresetsFor(ctx.site);
  };

  const root = document.createElement('div');
  // Audit 2026-05-10: vs-panel--pending hides the panel until the host
  // page finishes its initial hydration. YouTube renders a skeleton
  // state for ~500-1500ms on cold load with CSS that occasionally
  // clips/compresses children of #primary-inner — the bottom of our
  // pill buttons gets cut off until the skeleton state ends. Hiding
  // until then avoids the transient visual.
  root.className = 'vs-panel vs-panel--pending';
  root.dataset.vsSite = ctx.site;
  scheduleHostHydrationReveal(root, ctx);

  // Pinned = the saved/default speed when rememberSpeed is on. Used
  // to decorate that button with a small dot so the user sees which
  // speed will be applied to fresh videos.
  const computePinnedSpeed = (): number | null => {
    return ctx.settingsStore.getKey('rememberSpeed') === true ? ctx.speedStore.current() : null;
  };

  const buttonsRow = renderButtonsRow({
    speeds: resolvePresets(),
    current: ctx.speedStore.current(),
    pinned: computePinnedSpeed(),
    buttonTitle: ctx.i18n.t('panel.button.tooltip'),
  });
  /**
   * Resolve the user's slider range. Falls back to site bounds when the
   * user hasn't set a custom value or the stored value is incoherent
   * relative to the site (e.g. a TM-imported sliderMin that's below
   * what the site supports).
   */
  const resolveSliderRange = (): { min: number; max: number } => {
    const storedMin = ctx.settingsStore.getKey('sliderMin');
    const storedMax = ctx.settingsStore.getKey('sliderMax');
    const min =
      typeof storedMin === 'number' && storedMin >= bounds.min && storedMin < bounds.max
        ? storedMin
        : bounds.min;
    const max =
      typeof storedMax === 'number' && storedMax > min && storedMax <= bounds.max
        ? storedMax
        : bounds.max;
    return { min, max };
  };
  const initialRange = resolveSliderRange();
  const sliderContainer = renderSlider({
    current: ctx.speedStore.current(),
    min: initialRange.min,
    max: initialRange.max,
  });

  const gearWrapper = document.createElement('div');
  gearWrapper.className = 'vs-gear-wrapper';
  const gearBtn = document.createElement('button');
  gearBtn.type = 'button';
  gearBtn.className = 'vs-gear-button';
  // aria-label for screen readers; title gives the same affordance to
  // sighted hover users.
  gearBtn.setAttribute('aria-label', ctx.i18n.t('menu.title'));
  // Audit 2026-05-09 a11y Q1: the popup is a tabbed dialog with form
  // inputs (toggles, hotkey-capture, slider bounds), not a menu. Screen
  // readers announce the role correctly when role=dialog matches
  // haspopup=dialog.
  gearBtn.setAttribute('aria-haspopup', 'dialog');
  gearBtn.setAttribute('aria-expanded', 'false');
  gearBtn.title = ctx.i18n.t('menu.title');
  gearBtn.appendChild(vsFilledGearIcon(16));

  const settingsMenu = document.createElement('div');
  settingsMenu.className = 'settings-menu';
  settingsMenu.setAttribute('role', 'dialog');
  settingsMenu.setAttribute('aria-modal', 'false');
  settingsMenu.setAttribute('aria-label', ctx.i18n.t('menu.title'));
  settingsMenu.setAttribute('aria-hidden', 'true');

  gearWrapper.appendChild(gearBtn);
  gearWrapper.appendChild(settingsMenu);

  // Audit 2026-05-10: explicit "save as default" pin button. Until now
  // the only way to lock a speed as the new-video default was to
  // double-click on a preset — undocumented and not present in any
  // canonical media-player UI. Users dragging the slider also
  // unintentionally saved the dragged value as the default (slider
  // release used to call setSpeed = persist; now it calls
  // setTemporary, see slider 'change' handler above). This button
  // makes the explicit "save current as default" action discoverable
  // and one click away from anywhere in the panel. Click → setGlobal,
  // which writes speedStore.current + force-enables rememberSpeed +
  // toasts the user. The bookmark icon mirrors the in-button
  // saved-speed indicator for visual consistency.
  const pinBtn = document.createElement('button');
  pinBtn.type = 'button';
  pinBtn.className = 'vs-pin-button';
  pinBtn.setAttribute('aria-label', ctx.i18n.t('panel.pin.aria'));
  pinBtn.title = ctx.i18n.t('panel.pin.tooltip');
  pinBtn.appendChild(vsIcon('bookmark', 14));
  ctx.cleanup.addEventListener(pinBtn, 'click', () => {
    // Audit 2026-05-11 (post-0.4.0): pin must save the EFFECTIVE
    // playing speed, not the persisted global. Read order:
    //   1. video.playbackRate — the source of truth for "what's
    //      playing right now" (covers slider drag, hotkey, pill
    //      temp-click). Previously we read speedStore.current(),
    //      which is the persisted global — so e.g. global=2.75,
    //      user drags slider to 2.5, clicks pin → video reverted
    //      to 2.75 and 2.75 stayed as global. User reported.
    //   2. speedStore.smart() — temp-store fallback if video isn't
    //      resolved yet (rare race; pin appears after panel insert).
    //   3. speedStore.current() — last-ditch fallback.
    const video = ctx.discovery.resolve('video');
    const vRate =
      video instanceof HTMLVideoElement && Number.isFinite(video.playbackRate)
        ? video.playbackRate
        : null;
    const speed = vRate ?? ctx.speedStore.smart() ?? ctx.speedStore.current();
    if (Number.isFinite(speed)) {
      void setGlobal(ctx, speed);
    }
  });

  // FEAT-016: "finish N min earlier" badge. Lives INSIDE the buttons row
  // so the bottom-layout grid areas stay untouched; re-appended after
  // every presets rebuild (replaceChildren wipes it).
  const timeSaved = document.createElement('span');
  timeSaved.className = 'vs-time-saved';
  timeSaved.style.display = 'none';
  const updateTimeSaved = (speed: number): void => {
    const v = ctx.discovery.resolve('video') as HTMLVideoElement | null;
    const dur = v && Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    if (!dur || !(speed > 1.02)) {
      timeSaved.style.display = 'none';
      return;
    }
    const savedSec = dur * (1 - 1 / speed);
    const value =
      savedSec >= 60
        ? `${Math.round(savedSec / 60)}${ctx.i18n.t('time.min_suffix')}`
        : `${Math.round(savedSec)}${ctx.i18n.t('time.sec_suffix')}`;
    timeSaved.textContent = `−${value}`;
    timeSaved.title = ctx.i18n.t('panel.time_saved.tip', { value });
    timeSaved.style.display = '';
  };
  buttonsRow.appendChild(timeSaved);

  root.appendChild(buttonsRow);
  root.appendChild(sliderContainer);
  root.appendChild(pinBtn);
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
    // Drag is rAF-coalesced applyTransient (no storage write per pixel),
    // and persistence happens once on `change` (release). Before this
    // split, every `input` event triggered setSpeed → 2 storage writes;
    // a 2-second drag at 60–120 events/sec was hundreds of pointless
    // IPC round-trips to the service worker plus disk-IO. (Audit
    // 2026-05-11 W5.8: previous comment cited Chrome's 120-writes-per-
    // minute quota — that's chrome.storage.sync only, not .local. The
    // real benefit is IPC + disk amortization, which is still
    // material.)
    let pendingRaf: number | null = null;
    let pendingSpeed: number | null = null;
    ctx.cleanup.addEventListener(sliderInput, 'input', () => {
      const value = parseFloat(sliderInput.value);
      if (!Number.isFinite(value)) return;
      pendingSpeed = value;
      if (pendingRaf !== null) return;
      pendingRaf = requestAnimationFrame(() => {
        pendingRaf = null;
        if (pendingSpeed !== null) {
          // Audit 2026-05-11 W5.5 (PERF-005): updateSliderFill moved
          // into the rAF callback alongside applyTransient. Was
          // firing synchronously on every `input` (~120Hz on
          // high-DPI mice / touchpads) for 5 DOM mutations each =
          // ~600 DOM ops/sec where 60Hz repaint can absorb at most
          // 60×5=300. Same buttery feedback at half the cost.
          updateSliderFill(sliderInput);
          applyTransient(ctx, pendingSpeed);
          pendingSpeed = null;
        }
      });
    });
    ctx.cleanup.addEventListener(sliderInput, 'change', () => {
      if (pendingRaf !== null) {
        cancelAnimationFrame(pendingRaf);
        pendingRaf = null;
      }
      pendingSpeed = null;
      const value = parseFloat(sliderInput.value);
      if (Number.isFinite(value)) {
        // Audit 2026-05-10: slider release now applies as a TEMPORARY
        // (one-shot) speed for the current video — same semantics as
        // a single button click. Previously this called setSpeed()
        // which, when rememberSpeed was on, persisted the dragged
        // value as the global default. Users complained: dragging the
        // slider mid-video silently locked their default to that value
        // forever (next video started at the dragged speed). Setting
        // the global default is now an EXPLICIT action — either
        // double-click on a preset, or the new "save as default"
        // pin button next to the gear (see panel mounting below).
        void setTemporary(ctx, value);
      }
    });
    // Mobile: stop the page from scrolling while the user drags the slider
    // thumb. Mirrors .user.js:4824-4829 — without this, dragging on a
    // touch device scrolls the viewport instead of moving the thumb.
    // `passive: false` is required for preventDefault on touch events.
    ctx.cleanup.addEventListener(
      sliderInput,
      'touchmove',
      (e) => {
        e.preventDefault();
      },
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
      try {
        menuRegistry.dispose();
      } catch {
        /* swallow */
      }
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

  // Vertical flip decision is FROZEN at menu-open time. Without this,
  // every tab switch (rerender) recomputed flip-y based on the current
  // tab's content height — and tabs of different heights would put the
  // menu above-gear on one tab and below-gear on the next. User
  // perceived this as the menu jumping around (audit 2026-04-28). The
  // first call to adjustMenuPosition after open decides; later calls
  // (tab switches, settings change) only refresh horizontal placement
  // and max-height. Reset to null when the menu closes.
  let frozenFlipY: 'up' | 'down' | null = null;

  function adjustMenuPosition(): void {
    if (!isMenuOpen()) return;

    // Audit 2026-05-09 perf P1: batch all reads first, then all writes,
    // to avoid forced synchronous reflow. The previous interleaved
    // sequence triggered up to 4 forced layouts per call (write→read→
    // write→read→write→read→read), each one of which is a full style
    // recalc; on every settings-modal rerender that's noticeable jank,
    // especially on mobile.

    // ----- RESET (clear stale inline overrides BEFORE measuring) -----
    // Audit 2026-05-10 root-cause: settingsMenu.scrollHeight reflects
    // the CURRENT layout state — including any inline max-height we
    // wrote on a previous call. Reading naturalH without first clearing
    // max-height meant it returned the *clamped* value, not the
    // *natural* value. Subsequent comparisons (`naturalH > room`)
    // misfired, leading to alternating clamp/no-clamp on each call —
    // visually the menu would lose its top portion (header + tabs
    // pushed above viewport) and then "self-recover" on the next call.
    // Fix: clear all inline overrides upfront, take a single honest
    // measurement, then write the new computed values.
    settingsMenu.removeAttribute('data-vs-flip');
    settingsMenu.removeAttribute('data-vs-flip-y');
    settingsMenu.style.removeProperty('max-height');
    settingsMenu.style.removeProperty('left');
    settingsMenu.style.removeProperty('right');

    // ----- READS (batch 1, all post-reset) -----
    const PAD = 8;
    const wrapperRect = gearWrapper.getBoundingClientRect();
    const gearRect = gearBtn.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const menuRect = settingsMenu.getBoundingClientRect();
    const menuW = settingsMenu.offsetWidth || menuRect.width;
    const naturalH = settingsMenu.scrollHeight;
    const spaceBelow = Math.max(0, viewportH - gearRect.bottom - PAD);
    const spaceAbove = Math.max(0, gearRect.top - PAD);

    // ----- COMPUTE -----
    // Default: right-anchored under the gear.
    let absLeft = wrapperRect.right - menuW;
    if (absLeft < PAD) {
      const leftAnchored = wrapperRect.left;
      if (leftAnchored + menuW <= viewportW - PAD) {
        absLeft = leftAnchored;
      } else {
        absLeft = Math.max(PAD, viewportW - menuW - PAD);
      }
    }
    // Decide flip-y based on the natural (unclamped) menu height.
    // If we still don't have a frozen decision (initial open), use
    // the just-measured menuRect.bottom against the viewport bottom +
    // compare available spaces.
    if (frozenFlipY === null) {
      // menuRect at this point reflects natural menu height (max-height
      // and flip-y attribute were both cleared above).
      if (menuRect.bottom > viewportH - 4 && spaceAbove > spaceBelow) {
        frozenFlipY = 'up';
      } else {
        frozenFlipY = 'down';
      }
    }
    const room = frozenFlipY === 'up' ? spaceAbove : spaceBelow;
    const needsMaxHeight = naturalH > room && room > 0;

    // ----- WRITES (batch 2) -----
    settingsMenu.style.left = `${absLeft - wrapperRect.left}px`;
    settingsMenu.style.right = 'auto';
    if (frozenFlipY === 'up') {
      settingsMenu.setAttribute('data-vs-flip-y', 'up');
    }
    // 'down' = default; no flip-y attr needed (cleared in RESET above).
    if (needsMaxHeight) {
      settingsMenu.style.maxHeight = `${room}px`;
    }
    // No max-height = use the CSS default `calc(100vh - 80px)` ceiling
    // (no inline override needed; cleared in RESET above).
  }

  function closeMenu(): void {
    settingsMenu.classList.remove('show');
    settingsMenu.setAttribute('aria-hidden', 'true');
    gearBtn.setAttribute('aria-expanded', 'false');
    // Reset the frozen flip so the next open re-decides based on the
    // current viewport (the user may have scrolled or resized).
    frozenFlipY = null;
  }

  ctx.cleanup.addEventListener(gearBtn, 'click', (event) => {
    event.stopPropagation();
    if (isMenuOpen()) {
      closeMenu();
    } else {
      rerenderSettings();
      settingsMenu.classList.add('show');
      settingsMenu.setAttribute('aria-hidden', 'false');
      gearBtn.setAttribute('aria-expanded', 'true');
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

  // Audit 2026-05-09 MAJOR-UI: Escape closes the menu (a11y / standard
  // dialog convention). Capture phase so it wins over host-page handlers.
  // UX-030: Tab is trapped inside the open dialog — without the trap,
  // keyboard focus silently wandered into the host page behind the menu
  // and the user lost track of it.
  ctx.cleanup.addEventListener(
    document,
    'keydown',
    (event) => {
      if (!isMenuOpen()) return;
      const ev = event as KeyboardEvent;
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        ev.preventDefault();
        closeMenu();
        gearBtn.focus();
        return;
      }
      if (ev.key === 'Tab') {
        const focusables = settingsMenu.querySelectorAll<HTMLElement>(
          'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement;
        // Focus outside the dialog (e.g. still on the gear) — pull it in.
        if (!(active instanceof HTMLElement) || !settingsMenu.contains(active)) {
          ev.preventDefault();
          first.focus();
          return;
        }
        if (ev.shiftKey && active === first) {
          ev.preventDefault();
          last.focus();
        } else if (!ev.shiftKey && active === last) {
          ev.preventDefault();
          first.focus();
        }
      }
    },
    { capture: true },
  );

  // Click outside the gear-wrapper closes the menu.
  ctx.cleanup.addEventListener(document, 'click', (event) => {
    if (!isMenuOpen()) return;
    const target = event.target as Node | null;
    if (target && !gearWrapper.contains(target)) {
      closeMenu();
    }
  });

  // ----- Settings re-renderer -----
  function rerenderSettings(): void {
    // Dispose the previous menu's listeners first. Bounds the listener
    // count to the current render's needs.
    if (menuRegistry) menuRegistry.dispose();
    menuRegistry = new CleanupRegistry();
    const menuCtx: AppContext = { ...ctx, cleanup: menuRegistry };

    settingsMenu.replaceChildren(
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
      setActiveTab: (t) => {
        activeTab = t;
      },
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
        ? (on) => {
            void killSwitch.setDiscoveryEnabled(on);
          }
        : undefined,
      setHealthCheckEnabled: killSwitch
        ? (on) => {
            void killSwitch.setHealthCheckEnabled(on);
          }
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
    // UX-031: compact mode — CSS keys off this attribute to collapse the
    // panel to [current speed][gear].
    if (ctx.settingsStore.getKey('compactMode') === true) {
      root.dataset.vsCompact = '1';
    } else {
      delete root.dataset.vsCompact;
    }

    const chrome =
      ctx.discovery.resolve('rightControls') || ctx.discovery.resolve('controlsContainer');

    ctx.logger.info(
      `panel.applyLayout: pos=${pos} chrome=${chrome ? chrome.className : 'null'} sliderParent=${sliderContainer.parentElement?.className ?? '(orphan)'}`,
    );

    if (pos === 'video' && chrome) {
      sliderContainer.classList.add('vs-slider-in-chrome');
      if (sliderContainer.parentElement !== chrome || sliderContainer !== chrome.firstChild) {
        try {
          chrome.insertBefore(sliderContainer, chrome.firstChild);
          ctx.logger.info('panel.applyLayout: slider moved into chrome');
        } catch (e) {
          ctx.logger.warn('panel.applyLayout: chrome insert failed', e);
        }
      }
    } else {
      // Audit 2026-05-10: panel children in 'right'/'bottom' modes are
      // [buttons, slider, pin, gear]. v0.3.15 added the pin button —
      // before that the assumption was [buttons, slider, gear]. The
      // old check `sliderContainer.nextSibling !== gearWrapper` would
      // re-fire on every applyLayout call (because slider's real
      // next sibling is now pinBtn, not gearWrapper) and reorder the
      // children wrong: [buttons, pin, slider, gear]. Fix: anchor the
      // slider's expected next sibling to pinBtn, which is its true
      // neighbour in the desired layout.
      sliderContainer.classList.remove('vs-slider-in-chrome');
      if (sliderContainer.parentElement !== root || sliderContainer.nextSibling !== pinBtn) {
        try {
          root.insertBefore(sliderContainer, pinBtn);
          ctx.logger.info('panel.applyLayout: slider restored into panel');
        } catch (e) {
          ctx.logger.warn('panel.applyLayout: root insert failed', e);
        }
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
  let lastCompact = ctx.settingsStore.getKey('compactMode') === true;
  let lastPresetsKey = JSON.stringify(ctx.settingsStore.getKey('speedPresets') ?? []);
  let lastRange = initialRange;
  const offSubscribe = ctx.settingsStore.subscribe((next) => {
    // UX-031: compact toggled from the popup (or import) — reflect it
    // without requiring a navigation.
    if ((next.compactMode === true) !== lastCompact) {
      lastCompact = next.compactMode === true;
      applyLayoutImpl();
    }
    if (next.sliderPosition !== lastPos) {
      lastPos = next.sliderPosition;
      applyLayoutImpl();
      // Audit 2026-05-10: layout switch can move the gear button to a
      // new Y position (panel grows from 1 row to 2 rows when switching
      // to 'bottom'). The frozen flip-y decision from before the switch
      // becomes stale — reset so adjustMenuPosition picks fresh from
      // the new geometry.
      frozenFlipY = null;
    }
    // Speed-buttons row is reactive on speedPresets — when the user
    // toggles a speed in Settings → General we need to rebuild the row's
    // contents in place. Click handlers live on the outer `buttonsRow`
    // via event delegation, so swapping its CHILDREN doesn't lose the
    // handlers (audit M12).
    const nextPresetsKey = JSON.stringify(next.speedPresets ?? []);
    if (nextPresetsKey !== lastPresetsKey) {
      lastPresetsKey = nextPresetsKey;
      const fresh = renderButtonsRow({
        speeds: resolvePresets(),
        current: ctx.speedStore.current(),
        pinned: computePinnedSpeed(),
        buttonTitle: ctx.i18n.t('panel.button.tooltip'),
      });
      buttonsRow.replaceChildren(...Array.from(fresh.childNodes));
      // FEAT-016: the badge is a child of the row — re-append after wipe.
      buttonsRow.appendChild(timeSaved);
    }
    // Slider range reactive on sliderMin/sliderMax — re-resolve and
    // patch the live <input> in-place. Cheap (no rebuild) and preserves
    // the input's bound listeners. Same `resolveSliderRange` as the
    // initial render so fallback to site defaults stays consistent.
    const nextRange = resolveSliderRange();
    if (nextRange.min !== lastRange.min || nextRange.max !== lastRange.max) {
      lastRange = nextRange;
      setSliderRange(sliderContainer, nextRange.min, nextRange.max);
    }
    // Pinned dot is gated on rememberSpeed; refresh whenever the
    // settings change so the user sees the toggle take effect live.
    refreshPinnedButton(buttonsRow, computePinnedSpeed());
    if (isMenuOpen()) {
      rerenderSettings();
    }
  });
  ctx.cleanup.add(offSubscribe);

  return {
    element: root,
    refreshButtons(speed) {
      refreshActiveButton(buttonsRow, speed);
      // Pin tracks the saved/default speed; refresh it on every speed
      // change so a fresh setGlobal() (double-click) lights up the
      // matching pill within the same frame.
      refreshPinnedButton(buttonsRow, computePinnedSpeed());
      updateTimeSaved(speed);
    },
    refreshSlider(speed) {
      setSliderValue(sliderContainer, speed);
      updateTimeSaved(speed);
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
      // Audit 2026-05-09 sec C16: also remove orphan notification stack
      // and speed popup that live OUTSIDE root (anchored on the player
      // container / fullscreen element). Without this, after a teardown
      // the next ensureStack/ensurePopup reuses the detached node.
      try {
        disposeNotificationStack();
      } catch {
        /* swallow */
      }
      try {
        disposeSpeedPopup();
      } catch {
        /* swallow */
      }
      root.remove();
      sliderContainer.remove();
    },
  };
}
