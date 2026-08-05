/**
 * bootstrap(wxtCtx) -- the orchestrator.
 *
 * Called from src/entrypoints/content.ts on every content-script load.
 * Wires every collaborator together in dependency order, hands the final
 * AppContext to the speed controller, the panel, and the health checker.
 *
 * Order (must stay stable -- audit C2 puts strict requirements on
 * who-can-see-what):
 *
 *   0. Detect site; bail out if unsupported.
 *   1. TM coexistence check; early-exit if userscript is also active.
 *   2. Build hydrated stores + cache (the only async work).
 *   3. Build the discovery engine.
 *   4. Build i18n translator + logger + cleanup + meter.
 *   5. Stub UiPort -> stub Diagnostics so the AppContext is whole enough
 *      to construct the panel.
 *   6. Build the panel (needs ctx with stub UI).
 *   7. Wrap panel as the real UiPort; swap into ctx.ui.
 *   8. Build the real DiagnosticsPort backed by HealthChecker; swap.
 *   9. Run TM migration if first run.
 *  10. Inject styles + insert panel into the player.
 *  11. Attach video listeners (apply initial speed, restore on `playing`).
 *  12. Start the health watchdog.
 *  13. Site-specific subscribers (yt-navigate-finish / RuTube history bridge).
 */

import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { CleanupRegistry } from './app/cleanup';
import type { AppContext } from './app/context';
import type { DiagnosticsPort, Logger as LoggerPort, Translator, UiPort } from './app/ports';
import { SPEED_STEP, speedBoundsFor } from './config';
import { createSelectorCache } from './discovery/cache';
import { createDiscoveryEngine } from './discovery/engine';
import { Validators } from './discovery/validators';
import { createHealthChecker } from './health/checker';
import { createKillSwitch } from './health/kill-switch';
import { reportToClipboardText } from './health/report';
import type { DiagnosticReport } from './health/types';
import { detectBrowserLang } from './i18n/detect';
import { createTranslator } from './i18n/translator';
import { detectSite } from './sites/detect';
import { bootstrapRutubeSite } from './sites/rutube';
import {
  bootstrapYouTubeSite,
  extractYouTubeChannelKey,
  isYouTubeAdShowing,
  isYouTubeShortsPath,
} from './sites/youtube';
import {
  applyTransient,
  pickInitialSpeed,
  SELF_WRITE_GRACE_MS,
  setTemporary,
} from './speed/controller';
import { matchesHotkeyArray } from './speed/hotkeys';
import { createRatechangeMeter } from './speed/meter';
import { applyVolumeBoost } from './speed/volume-boost';
import { createBrowserStorageAdapter, type StorageAdapter } from './storage/adapter';
import { createCoalescingAdapter } from './storage/adapter-coalescing';
import { runTmMigration } from './storage/migration-tm';
import { markHintShown, wasHintShown } from './storage/onboarding-store';
import { createSettingsStore } from './storage/settings-store';
import { createSpeedStore } from './storage/speed-store';
import { createPanel, createUiPort, injectStyles, insertPanel, installThemeWatcher } from './ui';
import { disposeNotificationStack, showActionChip, showNotification } from './ui/notifications';
import { createLogger } from './utils/logger';
import { detectAndClaim, release as releaseCoexistMarker } from './utils/tm-coexist';

declare const __VS_VERSION__: string | undefined;
const SCRIPT_VERSION = typeof __VS_VERSION__ === 'string' ? __VS_VERSION__ : '0.1.0';

export interface BootstrapOptions {
  /** Storage adapter override. Defaults to the wxt/browser-backed one;
   *  the userscript build (Wave 3) injects a GM-storage adapter here so
   *  the same code path runs unchanged inside Tampermonkey. */
  adapter?: StorageAdapter;
}

export async function bootstrap(
  wxtCtx: ContentScriptContext,
  options: BootstrapOptions = {},
): Promise<void> {
  // 0. Site detection.
  const site = detectSite();
  if (!site) {
    console.info('[VIDEO-SPEEDS] unsupported host, bootstrap aborted');
    return;
  }

  // 1. TM coexistence.
  const decision = detectAndClaim();
  if (!decision.proceed) {
    // Show a one-time notification, but keep things minimal -- we don't have
    // the full UI infra at this stage yet.
    const lang = detectBrowserLang();
    const { t } = createTranslator(lang);
    showNotification(t('tm.detected.body'), { kind: 'warn', duration: 6000 });
    console.info('[VIDEO-SPEEDS] coexistence:', decision.reason);
    return;
  }

  const cleanup = new CleanupRegistry();
  // WXT cleanup -> our cleanup. ctx.invalidated triggers when extension
  // reloads (HMR or user clicks "Reload").
  wxtCtx.onInvalidated(() => {
    releaseCoexistMarker();
    cleanup.dispose();
  });

  const logger = createLogger({ scriptName: 'VIDEO-SPEEDS' });
  logger.info(`bootstrap site=${site} version=${SCRIPT_VERSION}`);

  // 2. Storage stores. The userscript build supplies a GM-storage adapter
  //    here so the same wiring runs inside Tampermonkey unchanged.
  const adapter = options.adapter ?? createBrowserStorageAdapter();
  const settingsStore = createSettingsStore(adapter);
  // Audit 2026-05-09 perf O1: speedStore is the only high-volume write
  // path (hotkey repeat at ~30/sec, slider drag bursts). Wrap its
  // adapter in a 200ms coalescer to amortize disk-IO and IPC. Audit
  // 2026-05-11 W2.1 (REL-004): surface coalesced write errors through
  // logger.warn so quota-exceeded / runtime-invalidated failures don't
  // disappear silently — previously speedStore reported success while
  // disk diverged.
  // REL-033/038 (2026-06-10): keep a handle on the coalescing adapter so
  // pending writes can be flushed on pagehide, and surface write failures
  // to the user (once per page) instead of only logging them.
  let notifyStorageWriteError: (() => void) | null = null;
  const coalescedSpeedAdapter = createCoalescingAdapter(adapter, {
    flushMs: 200,
    onWriteError: (key, err) => {
      logger.warn(`speedStore coalesced write failed for ${key}`, err);
      notifyStorageWriteError?.();
    },
  });
  const speedStore = createSpeedStore(coalescedSpeedAdapter);
  await settingsStore.init(site);
  await speedStore.init(site);
  // Without this, a double-click "save as default" followed by an instant
  // reload (within the 200 ms coalesce window) silently loses the write.
  cleanup.addEventListener(window, 'pagehide', () => {
    void coalescedSpeedAdapter.flushNow();
  });

  // 3. Discovery.
  // killSwitch is declared early (TDZ guard, audit 2026-05-09 sec C6) so
  // the closure inside isFullChainEnabled below can safely reference it
  // even if a future change in createDiscoveryEngine starts evaluating
  // the closure synchronously during construction. The actual handle is
  // assigned after AppContext is built.
  let killSwitch!: ReturnType<typeof createKillSwitch>;
  const cache = createSelectorCache(adapter, {
    scriptVersion: SCRIPT_VERSION,
  });
  await cache.hydrate();
  const discoveryEngine = createDiscoveryEngine({
    site,
    cache,
    validators: Validators,
    isFullChainEnabled: () => killSwitch?.isDiscoveryEnabled() ?? true,
    logger,
  });
  const discoveryPort = {
    hydrate: () => Promise.resolve(),
    resolve: (key: string) => discoveryEngine.resolve(key as never)?.element ?? null,
    invalidate: (key: string) => cache.purge(key as never),
    cacheStats: () => ({
      hits: discoveryEngine.metrics().cacheHits,
      misses: discoveryEngine.metrics().cacheMisses,
      ready: cache.isReady(),
    }),
  };

  // 4. Cross-cutting.
  const meter = createRatechangeMeter();
  // `lang` is mutable so the settings subscriber below can compare against
  // the LAST observed value, not the bootstrap-time value. With const, a
  // round-trip EN → RU → EN silently failed to switch back because the
  // baseline `lang` never updated.
  let lang = settingsStore.getKey('language');
  const i18n: Translator = createTranslator(lang);

  // 5. Stubs for the chicken-and-egg with UiPort + DiagnosticsPort.
  const stubUi: UiPort = {
    refreshButtons: () => {},
    refreshSlider: () => {},
    showNotification: () => {},
    applyLayout: () => {},
  };
  const stubDiagnostics: DiagnosticsPort = {
    report: () => ({}) as DiagnosticReport,
    isHealthy: () => true,
    killSwitchEngaged: () => false,
    trip: () => {},
  };

  const ctx: AppContext = {
    site,
    settingsStore,
    speedStore,
    ui: stubUi,
    discovery: discoveryPort,
    diagnostics: stubDiagnostics,
    cleanup,
    logger: logger as LoggerPort,
    i18n,
  };

  // 6. KillSwitch + HealthChecker (need ctx).
  killSwitch = createKillSwitch(ctx);
  const healthChecker = createHealthChecker({
    ctx,
    scriptVersion: SCRIPT_VERSION,
    discovery: discoveryEngine,
    meter,
    killSwitch: killSwitch.snapshot,
    selectorCache: cache,
    isHealthCheckEnabled: killSwitch.isHealthCheckEnabled,
    // Audit 2026-05-09 M2: pass the killSwitch subscribe so the checker
    // can re-arm itself if health-check is toggled back ON after bootstrap.
    killSwitchHandle: killSwitch,
    // After N consecutive unhealthy reports, flip the kill-switch's
    // health-check flag so the watchdog stops re-running and re-purging
    // the cache. The gear's red dot stays lit (panel.setGearWarning is
    // wired below), so the user gets a visible signal to investigate.
    onConsecutiveFailures: (count) => {
      logger.warn(
        `auto-trip: kill-switch health-check disabled after ${count} consecutive failures`,
      );
      void killSwitch.setHealthCheckEnabled(false);
    },
  });
  ctx.diagnostics = {
    report: () => healthChecker.runOnce(),
    isHealthy: healthChecker.isHealthy,
    killSwitchEngaged: () => !killSwitch.isHealthCheckEnabled(),
    trip: () => void killSwitch.trip(),
  };

  // 7. Inject styles, build panel, build real UiPort.
  injectStyles(site);
  const panel = createPanel({
    ctx,
    scriptVersion: SCRIPT_VERSION,
    killSwitch: {
      isDiscoveryEnabled: () => killSwitch.isDiscoveryEnabled(),
      isHealthCheckEnabled: () => killSwitch.isHealthCheckEnabled(),
      setDiscoveryEnabled: (on) => killSwitch.setDiscoveryEnabled(on),
      setHealthCheckEnabled: (on) => killSwitch.setHealthCheckEnabled(on),
    },
    diagActions: {
      recheck: () => {
        void healthChecker.runOnce();
      },
      copyReport: async () => {
        const report = healthChecker.getLastReport() ?? healthChecker.runOnce();
        const text = reportToClipboardText(report);
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch {
          return false;
        }
      },
      purgeCache: async () => {
        const confirmText = ctx.i18n.t('diag.purge_cache_confirm');
        const ok = typeof window.confirm === 'function' ? window.confirm(confirmText) : true;
        if (!ok) return;
        await cache.purgeAll();
        logger.info('diag: selector cache purged');
      },
      fullReset: async () => {
        const confirmText = ctx.i18n.t('diag.full_reset_confirm');
        // window.confirm is intentional here -- the reset is destructive
        // and the user should explicitly approve. There's no toast for
        // "are you sure" in the modal.
        const ok = typeof window.confirm === 'function' ? window.confirm(confirmText) : true;
        if (!ok) return;
        await cache.purgeAll();
        await settingsStore.reset();
        // SpeedStore has no reset(); clear smart + reapply default current.
        await speedStore.setSmart(null);
        await speedStore.setCurrent(speedBoundsFor(site).defaultSpeed);
        logger.info('diag: full reset performed');
      },
    },
  });
  // FEAT-016: reflect the live playback rate on the toolbar icon badge.
  // The SW owns chrome.action; we just message it the text to show ('' at
  // 1×). Deduped so the HLS-cascade retry storm doesn't spam the SW, and
  // the wxt/browser import is lazy + swallowed so the userscript build
  // (no toolbar, aliased-to-throwing shim) is a silent no-op.
  let lastBadgeText: string | null = null;
  const setToolbarBadge = (speed: number): void => {
    const text =
      Number.isFinite(speed) && Math.abs(speed - 1) > 0.005
        ? parseFloat(speed.toFixed(2)).toString()
        : '';
    if (text === lastBadgeText) return;
    lastBadgeText = text;
    void import('wxt/browser')
      .then(({ browser: br }) => br.runtime.sendMessage({ type: 'vs:speed-badge', text }))
      .catch(() => {
        /* SW asleep or userscript shim — badge is best-effort */
      });
  };

  const realUi = createUiPort({
    panel,
    playerContainer: () => discoveryPort.resolve('playerContainer'),
    onSpeed: setToolbarBadge,
  });
  ctx.ui = realUi;
  cleanup.add(() => panel.dispose());

  // FEAT-016: clear the toolbar badge when the page goes away — a same-tab
  // navigation to a non-video page would otherwise leave the last speed
  // lingering on the icon (Chrome persists per-tab badge across navigations).
  cleanup.addEventListener(window, 'pagehide', () => setToolbarBadge(1));

  // REL-038: real UI exists now — arm the storage-write-failure toast.
  // Shown at most once per page load to avoid a toast storm when the
  // adapter is persistently broken (quota exceeded, dead SW).
  let storageErrorToastShown = false;
  notifyStorageWriteError = () => {
    if (storageErrorToastShown) return;
    storageErrorToastShown = true;
    try {
      ctx.ui.showNotification(ctx.i18n.t('toast.storage_write_failed'), 'warn');
    } catch {
      /* notification is best-effort */
    }
  };

  // Re-create translator on language change. Audit 2026-05-09 MAJOR-bootstrap:
  // also force a rerender of the live panel/settings menu so on-screen
  // strings update immediately instead of staying stale until the next
  // SPA navigation.
  const offSettingsSub = settingsStore.subscribe((next) => {
    if (next.language !== lang) {
      lang = next.language;
      ctx.i18n = createTranslator(next.language);
      try {
        panel.rerenderSettings();
      } catch {
        /* swallow — rerender is best-effort */
      }
    }
  });
  cleanup.add(offSettingsSub);

  // 8. TM migration (one-shot).
  if (settingsStore.getKey('__migrated_from_tm') !== true) {
    const result = await runTmMigration(site, settingsStore, speedStore);
    if (result.imported) {
      ctx.ui.showNotification(ctx.i18n.t('migration.tm_imported'), 'info');
    }
  }

  // FEAT-015 (YouTube): per-channel memory key. The channel link renders
  // a beat after navigation, so retry a few times; once found, re-apply
  // the initial speed so a remembered per-channel value kicks in.
  const refreshChannelMemoryKey = (attempt = 0): void => {
    if (site !== 'youtube') return;
    if (cleanup.isDisposed) return;
    const key = extractYouTubeChannelKey();
    if (key) {
      if (ctx.speedStore.activeMemoryKey() !== key) {
        ctx.speedStore.setActiveMemoryKey(key);
        if (ctx.settingsStore.getKey('rememberPerVideo') === true) {
          const v = ctx.discovery.resolve('video') as HTMLVideoElement | null;
          if (v instanceof HTMLVideoElement) {
            applyTransient(ctx, pickInitialSpeed(ctx), { silent: true });
          }
        }
      }
      return;
    }
    ctx.speedStore.setActiveMemoryKey(null);
    if (attempt < 3) {
      ctx.cleanup.setTimeout(() => refreshChannelMemoryKey(attempt + 1), 800 * (attempt + 1));
    }
  };
  refreshChannelMemoryKey();

  // 9. Insert the panel. Retries every 750ms (up to ~15s) because the
  //    player container often appears after document_idle on SPA sites
  //    (RuTube renders the player asynchronously). The retry stops as
  //    soon as we land a real anchor; SPA-navigation listener (step 12)
  //    handles subsequent page changes.
  //
  // FEAT-020 (Shorts): the watch-page panel has no sane anchor in the
  // Shorts vertical layout — skip insertion there. Hotkeys and the
  // toolbar popup still control the Shorts <video>; the panel returns
  // on the next regular watch navigation.
  if (!(site === 'youtube' && isYouTubeShortsPath())) {
    scheduleInsertWithRetry(panel.element, ctx);
  }
  panel.applyLayout();

  // 9a. Wire the theme watcher AFTER the panel exists so the parent-chain
  //     luminance walk can use the panel as its reference element. The
  //     watcher itself listens to OS theme + host-page attribute changes;
  //     `reapplyTheme` is also invoked manually on each SPA reattach.
  const reapplyTheme = installThemeWatcher(site, ctx, () => panel.element);

  // 9b. Persist the detected theme to per-site settings so the toolbar
  //     popup can match the host-page theme instead of falling back to
  //     OS prefers-color-scheme (which doesn't follow YouTube's in-page
  //     theme toggle). Watch <html> data-vs-theme changes — the in-script
  //     watcher above writes that attribute on every detect/reapply.
  // Audit 2026-05-11 W6.3 (REL-014 + PERF-008): debounce by 500 ms.
  // YouTube can flip data-vs-theme rapidly (cinema mode, theater
  // toggle, sidebar collapse all retrigger our reapply). Without
  // debounce, an a/b/a/b oscillation could blow through Chrome's
  // chrome.storage.sync 120-writes/min quota IF settings-store were
  // ever migrated off .local. (Current code uses .local so the
  // quota isn't reachable, but the observer storm is still IPC
  // waste.) 500 ms is well above the typical YT mutation burst
  // window (~50-200 ms) so all transitional theme changes coalesce.
  let persistThemeTimer: ReturnType<typeof setTimeout> | null = null;
  const persistTheme = (): void => {
    const theme = document.documentElement.dataset.vsTheme;
    if (theme !== 'dark' && theme !== 'light') return;
    if (settingsStore.getKey('lastSeenTheme') === theme) return;
    if (persistThemeTimer !== null) clearTimeout(persistThemeTimer);
    persistThemeTimer = setTimeout(() => {
      persistThemeTimer = null;
      // Re-read at fire time — debounce window may have flipped back
      // to the previously-saved value.
      const liveTheme = document.documentElement.dataset.vsTheme;
      if (liveTheme !== 'dark' && liveTheme !== 'light') return;
      if (settingsStore.getKey('lastSeenTheme') === liveTheme) return;
      void settingsStore.update({ lastSeenTheme: liveTheme }).catch(() => {
        /* fire-and-forget */
      });
    }, 500);
  };
  cleanup.add(() => {
    if (persistThemeTimer !== null) {
      clearTimeout(persistThemeTimer);
      persistThemeTimer = null;
    }
  });
  persistTheme();
  const themePersistObserver = new MutationObserver(persistTheme);
  themePersistObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-vs-theme'],
  });
  ctx.cleanup.addObserver(themePersistObserver);

  // 10. Attach to <video> -- apply initial speed, install ratechange meter.
  //
  // We use a NESTED CleanupRegistry (`attachCleanup`) so the listeners
  // attachToVideo registers (loadedmetadata / ratechange / playing /
  // loadstart + retry timers) get disposed on every SPA navigation
  // BEFORE the next attach. Without this, RuTube (which reuses the same
  // <video> element across navigations) would accumulate N copies of
  // each listener after N navigations -- our ratechange handler would
  // fire N times and stomp on each other's restore writes (audit S15).
  //
  // The outer dispose chain (cleanup.add below) makes sure the current
  // attachCleanup goes down with the bootstrap when the extension
  // reloads / unloads.
  let attachCleanup = new CleanupRegistry();
  cleanup.add(() => attachCleanup.dispose());
  attachToVideo(ctx, meter, attachCleanup);

  // REL-040: YouTube replaces the <video> ELEMENT (not just src) after a
  // fatal decode error — e.g. AV1 NS_ERROR_DOM_MEDIA_METADATA_ERR on a
  // 4K quality switch — with NO SPA navigation. All our per-element
  // listeners die with the old node, the fresh element plays at rate=1,
  // and nothing restores the saved speed until the next navigation
  // (diagnosed 2026-07-09 via RATE-SPY: second element __spyId=2 playing
  // at rate=1 while listeners sat on the dead __spyId=1).
  //
  // Media events don't bubble, but capture-phase listeners on document
  // still see them. Any 'playing' from an unbranded <video> == a fresh
  // element → dispose the stale per-attach registry and re-arm. The
  // __vsAttached brand makes this a no-op for already-attached elements,
  // so the listener costs one property read per playing event.
  ctx.cleanup.addEventListener(
    document,
    'playing',
    (event) => {
      const t = event.target;
      if (!(t instanceof HTMLVideoElement)) return;
      if ((t as HTMLVideoElement & { __vsAttached?: boolean }).__vsAttached) return;
      // Hover previews on the YouTube home page also fire 'playing' from
      // unbranded <video> elements; without this filter every hover would
      // dispose the live attach registry and stomp the temporary speed.
      if (!Validators.video(t).ok) return;
      ctx.logger.info('unattached <video> is playing (element replaced?); re-attaching');
      attachCleanup.dispose();
      attachCleanup = new CleanupRegistry();
      attachToVideo(ctx, meter, attachCleanup);
    },
    { capture: true },
  );

  // RuTube same-URL debounce (audit B4.1). RuTube fires history events
  // for same-URL replaceState calls during widget mount; without this
  // we rebuild listeners + cascading retries on every spurious event.
  let lastRutubePath = location.pathname;

  // 11. Hotkey listener (global, capture so it wins over the page).
  //
  // Behaviour notes (matches .user.js:5055-5113):
  //   - speedUp/speedDown are TEMPORARY by design -- they shouldn't promote
  //     the value to "global default", so we go through setTemporary, not
  //     setSpeed. The previous wiring (setSpeed) wrote to current and, with
  //     rememberSpeed=true (the default), made every "+0.1" stick to the
  //     site for all future videos. Audit S8.
  //   - preventDefault stops Ctrl+C from also firing the browser copy.
  //   - skip when focus is in an editable element OR there is a selection
  //     OR a hotkey-input is in capture-mode -- otherwise binding Ctrl+C
  //     in settings would speed-up while typing and copy-paste would
  //     accelerate the video.
  // FEAT-012: per-page memory for the toggle-last-speed hotkey.
  let toggleLastSpeed: number | null = null;
  ctx.cleanup.addEventListener(
    document,
    'keydown',
    (event) => {
      const ev = event as KeyboardEvent;
      if (shouldSkipHotkey(ev)) return;
      const hk = settingsStore.getKey('hotkeys');
      // Audit 2026-05-11 W2.6 (PERF-004): match the hotkey BEFORE
      // resolving <video>. discovery.resolve() walks the parent chain
      // and (via the validator) calls getBoundingClientRect() — every
      // keystroke on a YT page used to pay that cost even when the
      // user was typing in the search bar. Reordering keeps the
      // resolve in the matched branch only.
      const speedUp = matchesHotkeyArray(ev, hk.speedUp);
      const speedDown = !speedUp && matchesHotkeyArray(ev, hk.speedDown);
      const reset = !speedUp && !speedDown && matchesHotkeyArray(ev, hk.resetSpeed);
      const toggle = !speedUp && !speedDown && !reset && matchesHotkeyArray(ev, hk.toggleLast);
      const seekFwd =
        !speedUp && !speedDown && !reset && !toggle && matchesHotkeyArray(ev, hk.seekForward);
      const seekBack =
        !speedUp &&
        !speedDown &&
        !reset &&
        !toggle &&
        !seekFwd &&
        matchesHotkeyArray(ev, hk.seekBack);
      if (!speedUp && !speedDown && !reset && !toggle && !seekFwd && !seekBack) return;
      // Configurable since 0.1.43 — read live from settings every keypress
      // so changes from the welcome page / settings menu apply without
      // reload. SPEED_STEP retained as the constant default.
      const step = settingsStore.getKey('speedStep') ?? SPEED_STEP;
      const v = ctx.discovery.resolve('video') as HTMLVideoElement | null;
      if (!v) return;
      ev.preventDefault();
      if (speedUp) {
        void setTemporary(ctx, v.playbackRate + step);
      } else if (speedDown) {
        void setTemporary(ctx, v.playbackRate - step);
      } else if (reset) {
        // FEAT-011: one keypress back to normal speed (temporary — the
        // saved default is untouched, same semantics as a button click).
        toggleLastSpeed = v.playbackRate;
        void setTemporary(ctx, 1);
      } else if (toggle) {
        // FEAT-012: swap current ↔ remembered. First press with no
        // memory falls back to 1×.
        const target = toggleLastSpeed ?? 1;
        toggleLastSpeed = v.playbackRate;
        void setTemporary(ctx, target);
      } else if (seekFwd || seekBack) {
        // FEAT-014: relative seek. Clamp into [0, duration].
        const span = settingsStore.getKey('seekSeconds') ?? 10;
        const delta = seekFwd ? span : -span;
        try {
          const dur = Number.isFinite(v.duration) ? v.duration : Number.POSITIVE_INFINITY;
          v.currentTime = Math.min(Math.max(0, v.currentTime + delta), dur);
        } catch (e) {
          ctx.logger.warn('hotkey seek failed', e);
        }
      }
    },
    { capture: true },
  );

  // 12. Site-specific navigation listener -> re-insert + re-apply.
  //
  // Clear the __vsAttached brand on every <video> in the document before
  // calling attachToVideo. Some SPA paths (RuTube most often) keep the
  // same <video> element and only swap its src; without clearing the
  // brand attachToVideo would early-return and the new video plays
  // unattached -- speed-restore stops working from video #2 onward
  // (audit S14).
  //
  // Also dispose `attachCleanup` so the previous video's listeners
  // (which may still be alive on the same reused element) drop before
  // we register fresh ones. Without this we double-fire ratechange on
  // every nav after the first (audit S15).
  const reattach = (): void => {
    // Audit 2026-05-09 sec C8: bail out immediately if the outer
    // bootstrap cleanup has already disposed. Without this guard, a
    // late-arriving navigation event (after content-script teardown
    // started) creates a fresh attachCleanup registry that never gets
    // tracked or disposed, leaking listeners.
    if (cleanup.isDisposed) return;
    if (ctx.site === 'rutube') {
      const path = location.pathname;
      if (path === lastRutubePath) {
        ctx.logger.debug(`reattach: same RT path (${path}), skip`);
        return;
      }
      lastRutubePath = path;
    }
    attachCleanup.dispose();
    attachCleanup = new CleanupRegistry();
    for (const v of document.querySelectorAll('video')) {
      delete (v as HTMLVideoElement & { __vsAttached?: boolean }).__vsAttached;
    }
    // Clear smart (one-shot) speed on every SPA navigation. Without this
    // a `setTemporary` from the previous video leaks into the new one
    // when YouTube auto-plays the next clip — pickInitialSpeed reads
    // smart and applies the prior temp to the fresh video. Mirrors
    // .user.js:1990 (yt-navigate-finish) + 2241 (handleRutubeNavigation).
    // Audit A2.2 / A2.3 / B2.3.
    void ctx.speedStore.setSmart(null);

    // Force a clean slate — detach the panel from its (possibly stale)
    // parent so the next insertPanel doesn't find itself in a detached
    // subtree the host framework has since replaced. RuTube swaps the
    // entire `.video-page-layout-module__left` column on each nav,
    // leaving our panel orphaned in a torn-down branch where the
    // idempotent guard mistakes "still in old parent" for "still
    // visible".
    //
    // YouTube DOES NOT swap the column — `ytd-watch-metadata` is stable
    // across yt-navigate-finish — so unconditionally detaching here
    // races with the displacement observer that immediately re-inserts.
    // Detach only on RuTube (audit 2026-05-09 MAJOR-bootstrap).
    if (ctx.site === 'rutube') {
      panel.element.parentElement?.removeChild(panel.element);
    }

    // FEAT-015 (YouTube): the channel changed with the navigation.
    refreshChannelMemoryKey();

    // FEAT-020 (Shorts): no panel on the Shorts layout — detach if we
    // navigated INTO Shorts; the regular insert path below restores it
    // when navigating back to a watch page.
    if (ctx.site === 'youtube' && isYouTubeShortsPath()) {
      panel.element.parentElement?.removeChild(panel.element);
      attachToVideo(ctx, meter, attachCleanup);
      reapplyTheme();
      return;
    }

    // RuTube React re-renders the page column AFTER the
    // history.pushState that triggers our reattach. Querying the DOM
    // immediately catches a transient mid-render state where layoutLeft
    // is partially mounted; chooseAnchor then anchors us into a
    // doomed-to-be-replaced container. The userscript waits 800ms
    // before its first insertion attempt for exactly this reason
    // (.user.js:2256-2258). YouTube doesn't need the delay --
    // ytd-watch-metadata is stable across yt-navigate-finish events.
    if (ctx.site === 'rutube') {
      ctx.cleanup.setTimeout(() => scheduleInsertWithRetry(panel.element, ctx), 800);
    } else {
      scheduleInsertWithRetry(panel.element, ctx);
    }
    attachToVideo(ctx, meter, attachCleanup);
    // Re-detect theme: YouTube users sometimes toggle dark mode mid-session
    // and we already re-evaluate on attribute change, but a manual reapply
    // here is cheap and covers any edge case where the host-page DOM
    // re-paints during the SPA transition (audit M10).
    reapplyTheme();
  };
  if (site === 'youtube') {
    bootstrapYouTubeSite(ctx).onNavigation(reattach);
  } else {
    bootstrapRutubeSite(ctx).onNavigation(reattach);
  }

  // 12a. bf-cache restore + browser back/forward navigation.
  //
  // `pageshow` fires with `event.persisted === true` when the page is
  // restored from the bf-cache (Firefox + Chrome both ship this). In that
  // path neither yt-navigate-finish nor RuTube's history bridge fire --
  // the page DOM is exactly as it was before, so the framework's
  // navigation hooks see no change. Force a reattach to be safe (audit
  // S16). `popstate` covers history.back()/forward() that some SPA paths
  // miss (RuTube sometimes only fires on pushState).
  ctx.cleanup.addEventListener(window, 'pageshow', (event) => {
    const ev = event as PageTransitionEvent;
    if (ev.persisted) {
      ctx.logger.info('pageshow: bf-cache restore, forcing reattach');
      reattach();
    }
  });
  ctx.cleanup.addEventListener(window, 'popstate', () => {
    ctx.logger.debug('popstate: forcing reattach');
    reattach();
  });

  // 12b. Fullscreen: hide the PERSISTENT interface, keep the feedback
  //      (user directive 2026-08-05, narrowing the 2026-07-27 blanket ban,
  //      which itself replaced the v0.3.5 MAJ-9 "panel stays visible";
  //      mirrors HDRezkaSpeeds).
  //
  //      Native fullscreen renders ONLY the fullscreenElement's subtree,
  //      and the panel is anchored beside / below the player container
  //      (ui/insertion.ts), so simply NOT re-parenting it is enough for
  //      the common case. The `:fullscreen` rules in ui/styles.ts cover
  //      the surfaces that live INSIDE the player (slider-in-chrome) plus
  //      the case where the site fullscreens an ancestor that contains
  //      our panel.
  //
  //      What is NOT hidden: the "1.50x" popup and the toast/chip stack.
  //      In fullscreen the panel is gone, so the hotkey is the only
  //      control and these are its only confirmation. Both are re-parented
  //      INTO the fullscreen element by ui/popup.ts and ui/notifications.ts
  //      for the same subtree reason. disposeNotificationStack() below is
  //      not "hide the toasts" — it drops a stack still positioned for the
  //      windowed layout so the next message is built in the right place.
  ctx.cleanup.addEventListener(document, 'fullscreenchange', () => {
    if (document.fullscreenElement) {
      try {
        disposeNotificationStack();
      } catch (e) {
        ctx.logger.warn('fullscreen: notification stack teardown failed', e);
      }
      return;
    }
    // Leaving fullscreen: the player chrome just resized, so the
    // in-chrome slider ('video' position) needs its geometry recomputed.
    if (ctx.settingsStore.getKey('sliderPosition') === 'video') {
      ctx.cleanup.setTimeout(() => panel.applyLayout(), 500);
    }
  });

  // 13. Start health watchdog.
  healthChecker.start();
  // Wire the diagnostic-action buttons to real handlers (panel re-renders
  // settings; the modal handlers receive `onDiag` and we proxy to here).
  // Also toggle the gear's red warning dot — without this the CSS rule
  // (.vs-gear-button.has-warning::after) is dead code and users miss a
  // visual cue that something broke (audit A3.1).
  cleanup.add(
    healthChecker.subscribe((report) => {
      // REL-035: a throw inside the render path must not kill the
      // subscription — otherwise one bad rerender silences the health
      // indicator (gear dot) for the rest of the page lifetime.
      try {
        panel.rerenderSettings();
        panel.setGearWarning(!report.healthy);
      } catch (e) {
        logger.warn('health subscriber render failed', e);
      }
      logger.debug('health:', report.healthy ? 'ok' : 'warn');
    }),
  );

  // 14. Message listener for the toolbar popup (added 0.2.4). The popup
  //     runs in a separate context with no access to HealthChecker /
  //     SelectorCache, so when the user opens it on a video page it
  //     asks the active tab (us) to run the diagnostic and stream the
  //     result back. This lets the popup show a LIVE status instead of
  //     a static "Not checked yet" placeholder.
  let ourRuntimeId: string | null = null;
  const onPopupMessage = async (
    msg: unknown,
    sender?: { id?: string; tab?: { id?: number } },
  ): Promise<{ ok: boolean; report?: DiagnosticReport; error?: string; speed?: number }> => {
    // Sender validation (audit 2026-05-09 sec C4): reject messages from
    // foreign extensions and from in-page content scripts. The intended
    // caller is our own popup (an extension page → sender.tab is
    // undefined) sharing our runtime id. ourRuntimeId is captured below
    // when the listener is installed (after the dynamic browser import).
    if (sender?.id && ourRuntimeId && sender.id !== ourRuntimeId) {
      return { ok: false, error: 'foreign_sender' };
    }
    if (sender?.tab !== undefined) {
      return { ok: false, error: 'tab_sender_blocked' };
    }
    const m = msg as { type?: string } | null | undefined;
    if (!m || typeof m.type !== 'string') {
      return Promise.resolve({ ok: false, error: 'no_type' });
    }
    try {
      switch (m.type) {
        case 'vs:recheck': {
          const report = healthChecker.runOnce();
          return Promise.resolve({ ok: true, report });
        }
        case 'vs:get-status': {
          const report = healthChecker.getLastReport() ?? healthChecker.runOnce();
          return Promise.resolve({ ok: true, report });
        }
        case 'vs:purge-cache': {
          // Await: the popup shows success/failure based on this resolved
          // value. Without await a real adapter failure would surface as
          // ok=true and the user would think the purge succeeded.
          await cache.purgeAll();
          return Promise.resolve({ ok: true });
        }
        // FEAT-021: popup quick actions — read/apply the live speed of
        // the video in THIS tab without opening the in-player menu.
        case 'vs:get-speed': {
          const v = ctx.discovery.resolve('video') as HTMLVideoElement | null;
          if (!(v instanceof HTMLVideoElement)) {
            return Promise.resolve({ ok: false, error: 'no_video' });
          }
          return Promise.resolve({
            ok: true,
            speed: v.playbackRate,
          } as { ok: boolean; speed?: number });
        }
        case 'vs:set-speed': {
          const speed = (msg as { speed?: unknown }).speed;
          if (typeof speed !== 'number' || !Number.isFinite(speed)) {
            return Promise.resolve({ ok: false, error: 'bad_speed' });
          }
          const v = ctx.discovery.resolve('video') as HTMLVideoElement | null;
          if (!(v instanceof HTMLVideoElement)) {
            return Promise.resolve({ ok: false, error: 'no_video' });
          }
          await setTemporary(ctx, speed);
          return Promise.resolve({ ok: true, speed: v.playbackRate } as {
            ok: boolean;
            speed?: number;
          });
        }
        default:
          return Promise.resolve({ ok: false, error: 'unknown_type' });
      }
    } catch (e) {
      return Promise.resolve({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };
  // Dynamic import keeps wxt/browser out of the userscript bundle (the
  // userscript build aliases it to a throwing shim). isDisposed guard
  // (audit 2026-05-09 C7): without it, a fast HMR/cleanup-before-resolve
  // race would call `cleanup.add()` after dispose and throw via assertLive.
  void import('wxt/browser').then(({ browser: br }) => {
    if (cleanup.isDisposed) return;
    try {
      ourRuntimeId = br.runtime.id ?? null;
      br.runtime.onMessage.addListener(onPopupMessage);
      cleanup.add(() => {
        try {
          br.runtime.onMessage.removeListener(onPopupMessage);
        } catch {
          /* swallow */
        }
      });
    } catch (e) {
      logger.warn('popup message listener install failed', e);
    }
  });

  logger.info('bootstrap complete');
}

/**
 * Try to insert the panel; retry with exponential backoff (audit B4.3)
 * until total ~30s elapsed when the anchor isn't yet in the DOM. Stops
 * as soon as insertion succeeds OR the retry budget is exhausted.
 *
 * Backoff schedule: 500ms → 750ms → 1125ms → ... × 1.5 capped at 5000ms.
 * Approximate total: ~30s before giving up. RuTube on a slow connection
 * can take 15+ seconds to mount the player; the previous flat 750ms × 20
 * = 15s budget gave up before the player appeared on those installs.
 */
/**
 * The one thing the panel says to a brand-new user, once per profile.
 *
 * Everything else is taught on the welcome page, in a tab that opens at
 * install and is often closed unread — after which the panel explains itself
 * only through a `title` attribute, i.e. only to someone already hovering a
 * button with a mouse. This chip names the two non-obvious things (click vs
 * double-click, and that the gear holds the hotkeys) in the place where they
 * are actually used, then never appears again.
 */
let firstRunHintAttempted = false;

function showFirstRunHint(ctx: AppContext): void {
  // Synchronous latch on top of the stored flag: the panel re-inserts on
  // every SPA navigation, and two of those inside the storage round-trip
  // would both read "not shown yet" and raise two identical chips.
  if (firstRunHintAttempted) return;
  firstRunHintAttempted = true;
  const adapter = createBrowserStorageAdapter();
  void wasHintShown(adapter).then((seen) => {
    if (seen) return;
    // Written BEFORE showing: a failed write must not turn into a hint on
    // every page load for the rest of the profile's life.
    void markHintShown(adapter).then(() => {
      try {
        showActionChip(ctx.i18n.t('onboarding.first_run'), {
          kind: 'info',
          icon: 'help-circle',
          dismissLabel: ctx.i18n.t('chip.dismiss'),
          playerContainer: ctx.discovery.resolve('playerContainer'),
        });
      } catch (e) {
        ctx.logger.warn('first-run hint render failed', e);
      }
    });
  });
}

/**
 * FEAT-018/20 (ported from HDRezka twin): a durable failure chip (warn ✕ +
 * a "Reload" action) for the two terminal give-up paths. Replaces the
 * auto-dismissing 3s warn toast so the message — and its recovery action —
 * stays put until the user acts.
 */
function showFailureChip(ctx: AppContext, message: string): void {
  try {
    showActionChip(message, {
      kind: 'warn',
      icon: 'alert',
      dismissLabel: ctx.i18n.t('chip.dismiss'),
      action: { label: ctx.i18n.t('chip.reload'), onClick: () => location.reload() },
      playerContainer: ctx.discovery.resolve('playerContainer'),
    });
  } catch (e) {
    ctx.logger.warn('failure chip render failed', e);
  }
}

function scheduleInsertWithRetry(panelEl: HTMLElement, ctx: AppContext): void {
  const MAX_ATTEMPTS = 16;
  const BASE_DELAY = 500;
  const MAX_DELAY = 5000;
  const BACKOFF = 1.5;
  let attempts = 0;
  let delay = BASE_DELAY;
  let observerInstalled = false;

  function tryOnce(): void {
    attempts += 1;
    let result: ReturnType<typeof insertPanel>;
    try {
      result = insertPanel(panelEl, ctx);
    } catch (e) {
      ctx.logger.warn(`insertPanel threw on attempt ${attempts}`, e);
      result = { parent: null, anchor: 'no-anchor' as const };
    }
    const inDoc = document.contains(panelEl);
    const placed = result.anchor !== 'no-anchor' && inDoc;

    if (placed && !result.tentative) {
      // Final placement -- preferred anchor. Stop the retry loop, install
      // the displacement observer, and we're done.
      ctx.logger.info(`panel inserted via ${result.anchor} on attempt ${attempts}`);
      if (!observerInstalled) {
        installRemovalObserver(panelEl, ctx, scheduleInsertWithRetry);
        observerInstalled = true;
      }
      showFirstRunHint(ctx);
      return;
    }

    if (placed && result.tentative) {
      // Tentative placement -- panel is visible, but the preferred anchor
      // (e.g. `#primary-inner > #below` on YT) hasn't appeared yet. Keep
      // retrying so we migrate to the proper home as soon as it does. We
      // intentionally DON'T install the displacement observer yet -- once
      // we move the panel to the preferred parent the observer's captured
      // `parent` reference would be stale and force a needless reschedule
      // (audit follow-up to S17).
      ctx.logger.debug(
        `panel tentatively at ${result.anchor} on attempt ${attempts}; continuing retry for preferred anchor`,
      );
    }

    if (attempts >= MAX_ATTEMPTS) {
      if (placed) {
        // Tentative is "good enough" after the budget runs out -- the user
        // sees the panel, just not in the absolutely-best spot. Promote to
        // final and install the observer so SPA churn still triggers
        // reattach on subsequent navigations.
        ctx.logger.info(
          `panel finalized via tentative anchor ${result.anchor} after ${attempts} attempts`,
        );
        if (!observerInstalled) {
          installRemovalObserver(panelEl, ctx, scheduleInsertWithRetry);
          observerInstalled = true;
        }
      } else {
        ctx.logger.warn(
          `panel insertion failed after ${attempts} attempts; giving up until next SPA nav`,
        );
        // Surface this to the user. Silent failure left the page with no
        // gear, no notification, no explanation. A durable chip (with a
        // Reload action that kicks the retry cycle from scratch) stays put
        // instead of vanishing in 3s. It lives in the page body, so it
        // appears even when the panel itself never landed.
        showFailureChip(ctx, ctx.i18n.t('panel.insertion_failed'));
      }
      return;
    }
    ctx.cleanup.setTimeout(tryOnce, delay);
    delay = Math.min(MAX_DELAY, Math.round(delay * BACKOFF));
  }
  tryOnce();
}

/**
 * Watch for our panel being removed OR displaced by host-framework re-renders.
 *
 * Two failure modes this guards against:
 *   1. Removal — SPA framework (YouTube's ytd-watch-flexy is the canonical
 *      case) re-renders its child list and our panel goes with it. We
 *      disconnect and call `reschedule` to re-run the full retry loop.
 *   2. Displacement — RuTube's React renders the title-section AFTER our
 *      initial insertion runs, calling `insertBefore(title, panel)` and
 *      pushing our panel from "right after the player" to "after the
 *      title block". Panel stays in the same parent so removal-detection
 *      misses it. Re-run insertPanel; the idempotent guard skips when
 *      we're already at the right spot, otherwise moves the panel back.
 *
 * Narrow-scope: observe ONLY the panel's direct parent with
 * `childList:true`. The previous implementation watched
 * `document.documentElement` with `subtree:true`, which fired the callback
 * on EVERY DOM mutation in the page (YouTube's player chrome alone fires
 * thousands per minute) -- the whole-document watch was a measurable CPU
 * hit on long-running tabs (audit S17). Direct-parent watch fires only
 * when our specific sibling changes.
 *
 * If an ANCESTOR is removed (which takes our parent + panel down with it),
 * this observer doesn't catch it -- but the next SPA-nav reattach calls
 * insertPanel which detects the missing panel and re-anchors. The narrow
 * scope is safe at the cost of relying on that fallback.
 */
function installRemovalObserver(
  panelEl: HTMLElement,
  ctx: AppContext,
  reschedule: (panel: HTMLElement, ctx: AppContext) => void,
): void {
  const parent = panelEl.parentElement;
  if (!parent) return; // shouldn't happen -- caller invoked us post-insert
  // Idempotency brand: skip if we already have a removal observer
  // tracking this exact panel on this exact parent. Without the guard,
  // rapid SPA navigation on RuTube (next-up clicks within the 800 ms
  // path-changed reattach window) schedules overlapping insert chains
  // that each install a sibling observer on the same parent — every
  // child mutation then fires the callback twice (or three times),
  // doubling per-mutation work for the rest of the page lifetime.
  type Branded = Element & { __vsRemovalObserverPanel?: HTMLElement };
  if ((parent as Branded).__vsRemovalObserverPanel === panelEl) return;
  (parent as Branded).__vsRemovalObserverPanel = panelEl;
  ctx.cleanup.add(() => {
    if ((parent as Branded).__vsRemovalObserverPanel === panelEl) {
      delete (parent as Branded).__vsRemovalObserverPanel;
    }
  });
  // Track the last known previous-sibling so we only re-run insertPanel
  // when the panel's position has ACTUALLY shifted. Without this guard
  // YouTube's high-volume mutation traffic (comments hydrating, ads
  // attaching, recommendations updating) ran insertPanel thousands of
  // times per page load -- enough to block the main thread and stop the
  // page from responding to clicks (user bug 2026-04-27).
  let lastPrev: Element | null = panelEl.previousElementSibling;
  const observer = new MutationObserver(() => {
    if (panelEl.parentNode !== parent || !document.contains(panelEl)) {
      ctx.logger.info('panel removed from DOM by host framework; re-inserting');
      observer.disconnect();
      reschedule(panelEl, ctx);
      return;
    }
    // O(1) displacement check: only re-run insertPanel when our position
    // among siblings actually changed. RuTube's title-section hydration
    // (the case the re-run was added for) shifts our previous-sibling
    // from null/player to the title-section; YT's comments/ad churn
    // doesn't touch our immediate neighbours so this short-circuits.
    const currentPrev = panelEl.previousElementSibling;
    if (currentPrev === lastPrev) return;
    lastPrev = currentPrev;
    try {
      insertPanel(panelEl, ctx);
      // Update lastPrev AFTER insertPanel so the corrected position is
      // the new baseline -- otherwise the very next mutation (caused by
      // our own removeChild + insertBefore) would compare against the
      // pre-correction prev and trigger a redundant insertPanel call.
      lastPrev = panelEl.previousElementSibling;
    } catch (e) {
      ctx.logger.warn('insertPanel re-run after sibling change failed', e);
    }
  });
  observer.observe(parent, { childList: true });
  ctx.cleanup.addObserver(observer);
}

/**
 * Apply the chosen initial speed once the video element is ready, install
 * a ratechange listener that feeds the meter, AND fight HLS-driven
 * playbackRate resets (the player's ABR / quality-change / manifest
 * reload silently snaps rate back to 1.0; on RuTube and any HLS site this
 * happens routinely). Mirrors .user.js:2456-2531 + 2477-2501.
 *
 * Re-attach safety: SPA navigation can replace the <video> element; we
 * detect a fresh element by the `__vsAttached` brand and re-bind. The
 * orchestrator calls this on every navigation (`reattach`) -- previously
 * the brand was set-and-never-cleared, so calls 2..N silently no-op'd
 * (audit S14).
 *
 * `cleanup` argument MUST be a per-attach sub-registry the orchestrator
 * disposes before each reattach. Without this, RuTube's reuse of the same
 * <video> element across navigations doubles up listeners on every nav
 * (audit S15).
 */
function attachToVideo(
  ctx: AppContext,
  meter: ReturnType<typeof createRatechangeMeter>,
  cleanup: CleanupRegistry,
  attempt = 0,
): void {
  const v = ctx.discovery.resolve('video');
  if (!(v instanceof HTMLVideoElement)) {
    // Audit 2026-05-11 W6.1 (REL-012): cap retries with exponential
    // backoff. Previously this looped forever at 500 ms intervals on
    // pages where the video never appears (host-page glitch,
    // unsupported subpath). Now: 20 attempts, 500 ms × 1.2^attempt,
    // capped at 5 s. The orchestrator re-arms attachToVideo on every
    // SPA navigation, so giving up here just means the next nav
    // gets a fresh try.
    if (attempt >= 20) {
      ctx.logger.warn('attachToVideo: gave up after 20 attempts; will re-arm on next SPA nav');
      // REL-039: tell the user instead of failing silently. The retry
      // budget spans ~80 s, so this only fires on genuinely broken pages.
      // Durable chip with a Reload action (FEAT-018/20).
      showFailureChip(ctx, ctx.i18n.t('panel.video_not_found'));
      return;
    }
    const delay = Math.min(5000, Math.round(500 * 1.2 ** attempt));
    cleanup.setTimeout(() => attachToVideo(ctx, meter, cleanup, attempt + 1), delay);
    return;
  }
  type Branded = HTMLVideoElement & { __vsAttached?: boolean; __vsSelfWriteAt?: number };
  if ((v as Branded).__vsAttached) return;
  (v as Branded).__vsAttached = true;

  // Pre-clear smart on fresh attach. Mirror .user.js:2446 — every fresh
  // video binding wipes the temp so an old smart from the previous
  // <video> can't bleed (audit B2.3 / A2.4).
  void ctx.speedStore.setSmart(null);

  // FEAT-017: re-apply the user's volume boost to the fresh element.
  // No-op (and no audio graph) while the setting sits at 100%.
  const boost = ctx.settingsStore.getKey('volumeBoost');
  if (typeof boost === 'number' && boost > 1.001) {
    applyVolumeBoost(v, boost, ctx.logger);
  }

  let lastSrc = v.currentSrc || v.src || '';
  let isSelfWrite = false;

  const isSite = (s: 'youtube' | 'rutube'): boolean => ctx.site === s;
  // FEAT-019: ads play at YouTube's own pace. While an ad is showing we
  // neither count ratechanges in the meter, nor sync our UI to the ad's
  // rate, nor force the user's speed onto it — the post-ad 'playing'
  // event restores the saved speed on the actual content.
  const isAd = (): boolean => isSite('youtube') && isYouTubeAdShowing(v);

  /** Recent self-write check: controller stamps `__vsSelfWriteAt` on the
   *  video each time it writes playbackRate. We honour that timestamp
   *  here so click-router writes are not reverted by their own
   *  ratechange callback (audit C2.4). */
  const isFreshSelfWrite = (): boolean => {
    const ts = (v as Branded).__vsSelfWriteAt ?? 0;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    // REL-036: bound the delta on both sides. A timer glitch (suspend /
    // resume, clock source change) can make `now - ts` negative or huge;
    // either way the stamp is not "fresh", so fall through to the normal
    // revert path instead of treating a foreign write as ours.
    const delta = now - ts;
    return delta >= 0 && delta < SELF_WRITE_GRACE_MS;
  };

  const apply = (reason: string): void => {
    // FEAT-019: never force the user's speed onto an ad.
    if (isAd()) return;
    const target = pickInitialSpeed(ctx);
    if (Math.abs(v.playbackRate - target) < 0.005) return;
    // Use applyTransient (no storage write) — storage already holds the
    // value we're applying; pickInitialSpeed READS it. Before this change
    // each retry tick called setSpeed, which wrote to storage twice. With
    // 4 retries per attach × 2 writes = 8 storage writes per video attach,
    // and src-change events fired the cascade again. ratechange-revert
    // protection still works via __vsSelfWriteAt timestamp set inside
    // applyToVideo + isFreshSelfWrite() check.
    isSelfWrite = true;
    try {
      applyTransient(ctx, target, { silent: true });
    } finally {
      isSelfWrite = false;
    }
    ctx.logger.debug(`attachToVideo: re-applying ${target}x (${reason})`);
  };

  // Initial application. The cascade-retry loop only runs on RuTube
  // (its HLS player periodically resets rate during init). YouTube's
  // adaptive delivery doesn't, so we'd be running 4 redundant
  // setSpeed → 4 storage writes per video for nothing (audit C2.6).
  if (v.readyState >= 1) {
    apply('ready');
  } else {
    cleanup.addEventListener(v, 'loadedmetadata', () => apply('loadedmetadata'), { once: true });
  }
  if (!isSite('youtube')) {
    for (const ms of [100, 300, 500, 1000]) {
      cleanup.setTimeout(() => apply(`retry+${ms}ms`), ms);
    }
  }

  // Per-site ratechange branch (audit A2.4):
  //   - YouTube: a rate change we didn't make is most often the user
  //     picking a value in YT's own settings → speed menu. Accept it,
  //     sync UI silently (no popup — they already saw YT's UI), persist
  //     as current. Mirror .user.js:2553 syncUIWithVideoSpeed.
  //   - RuTube/HDRezka: site is fighting our rate (HLS quality/manifest
  //     reload). Re-apply with a 50ms setTimeout so we break out of the
  //     ratechange callback's microtask. Mirror .user.js:2545-2551.
  let prev = v.playbackRate;
  cleanup.addEventListener(v, 'ratechange', () => {
    const next = v.playbackRate;
    // FEAT-019: rate flapping during ad playback is YouTube's business —
    // don't meter it, don't mirror it into our UI, don't fight it.
    if (isAd()) {
      prev = next;
      return;
    }
    // Skip self-writes when feeding the meter so HealthChecker's "rate
    // resets storm" detection isn't tripped by our own corrections
    // (audit C2.2). REL-034: also skip transitions through rate=0 —
    // player lifecycle noise (ad start/stop, HLS buffering) rather than
    // the site fighting our speed; counting them inflates perMinute()
    // and can trip the rate-storm check on perfectly healthy pages.
    if (!isSelfWrite && !isFreshSelfWrite() && prev > 0 && next > 0) {
      meter.tick(prev, next);
    }
    prev = next;
    if (isSelfWrite || isFreshSelfWrite()) return;
    const target = pickInitialSpeed(ctx);
    if (Math.abs(next - target) <= 0.005) return;

    if (isSite('youtube')) {
      // YouTube: rate changed externally — could be the user picking a
      // value in YT's own speed menu, OR YT's own normalisation (HLS
      // quality switch, autoplay/navigation default, manifest reload).
      // We can't reliably tell which, and the userscript reference
      // (.user.js:2553-2554 syncUIWithVideoSpeed) deliberately doesn't
      // try: it just mirrors the new rate in the UI without touching
      // persisted storage. The saved global stays intact, so the next
      // video still attaches at the user's chosen speed (which can only
      // be set via OUR buttons/slider). Without this discipline an HLS
      // reset to 1.0 silently overwrote the user's saved global=2 —
      // user bug 2026-04-27 / audit S18.
      ctx.ui.refreshButtons(next, { silent: true });
      ctx.ui.refreshSlider(next);
      ctx.logger.info(
        `ratechange-sync(yt-external): UI -> ${next} (saved current preserved at ${target})`,
      );
    } else {
      // Site is reverting; counter-revert after a microtask. Routed
      // through the per-attach cleanup registry so an SPA navigation that
      // disposes the attach also kills any in-flight revert before it
      // can fire on the next page's video element.
      cleanup.setTimeout(() => apply('ratechange-revert'), 50);
    }
  });

  // playing-event revert: covers seek + quality switch + tab-resume
  // resets that don't always fire ratechange. .user.js:2477-2501.
  // FEAT-019: this is also the post-ad restore point — the first
  // content 'playing' after an ad re-applies the user's speed.
  cleanup.addEventListener(v, 'playing', () => {
    if (isAd()) return;
    if (isSelfWrite || isFreshSelfWrite()) return;
    const target = pickInitialSpeed(ctx);
    if (Math.abs(v.playbackRate - target) > 0.005) {
      apply('playing-revert');
    }
  });

  // loadstart fires on every HLS-segment fetch. Don't clear smart-speed
  // unless this is an actual src change. .user.js:2504-2515.
  cleanup.addEventListener(v, 'loadstart', () => {
    const nowSrc = v.currentSrc || v.src || '';
    if (nowSrc && nowSrc !== lastSrc) {
      lastSrc = nowSrc;
      void ctx.speedStore.setSmart(null);
      if (isSite('youtube')) {
        // YT just needs a single late re-apply once metadata is in.
        cleanup.setTimeout(() => apply('src-change'), 100);
      } else {
        for (const ms of [100, 300, 500, 1000]) {
          cleanup.setTimeout(() => apply(`src-change+${ms}ms`), ms);
        }
      }
    }
  });
}

/**
 * Skip hotkey processing when:
 *   - focus is in an input/textarea/select/contenteditable (typing)
 *   - a hotkey-input is in capture-mode (settings tab)
 *   - the user has a non-empty text selection on the page (about to copy)
 * Mirrors .user.js:5060-5073.
 */
function shouldSkipHotkey(ev: KeyboardEvent): boolean {
  const target = ev.target as Element | null;
  if (target instanceof HTMLInputElement) {
    const t = target.type.toLowerCase();
    // checkboxes/radio/range buttons aren't "typing into a field" so the
    // hotkey should still fire (toggling rememberSpeed shouldn't gate the
    // hotkey). Original limits the skip to actual text-entry types.
    if (
      t === 'text' ||
      t === 'search' ||
      t === 'url' ||
      t === 'email' ||
      t === 'password' ||
      t === 'number' ||
      t === 'tel'
    ) {
      return true;
    }
  }
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  // Hotkey-capture in settings: input element with .vs-hotkey-input class
  // is focused -- pressing keys there should bind, not change speed.
  if (target?.classList.contains('vs-hotkey-input')) return true;
  // Non-empty selection -- user is about to copy.
  const sel = window.getSelection?.();
  if (sel && sel.toString().length > 0) return true;
  return false;
}
