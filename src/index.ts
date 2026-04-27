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
import type {
  DiagnosticsPort,
  Logger as LoggerPort,
  NotificationKind,
  Translator,
  UiPort,
} from './app/ports';
import { detectFeatures } from './utils/feature-detect';
import {
  createBrowserStorageAdapter,
  type StorageAdapter,
} from './storage/adapter';
import { createSettingsStore } from './storage/settings-store';
import { createSpeedStore } from './storage/speed-store';
import { runTmMigration } from './storage/migration-tm';
import { createSelectorCache } from './discovery/cache';
import { createDiscoveryEngine } from './discovery/engine';
import { Validators } from './discovery/validators';
import { createRatechangeMeter } from './speed/meter';
import { matchesHotkeyArray } from './speed/hotkeys';
import {
  pickInitialSpeed,
  setSpeed,
  setTemporary,
  SELF_WRITE_GRACE_MS,
} from './speed/controller';
import { SPEED_STEP, speedBoundsFor } from './config';
import { createTranslator } from './i18n/translator';
import { detectBrowserLang } from './i18n/detect';
import { createLogger } from './utils/logger';
import { detectAndClaim, release as releaseCoexistMarker } from './utils/tm-coexist';
import { detectSite } from './sites/detect';
import { bootstrapYouTubeSite } from './sites/youtube';
import { bootstrapRutubeSite } from './sites/rutube';
import {
  createPanel,
  createUiPort,
  insertPanel,
  injectStyles,
  installThemeWatcher,
} from './ui';
import { showNotification } from './ui/notifications';
import { installFullscreenReparent } from './ui/popup';
import { createKillSwitch } from './health/kill-switch';
import { createHealthChecker } from './health/checker';
import { reportToClipboardText } from './health/report';
import type { DiagnosticReport } from './health/types';

declare const __VS_VERSION__: string | undefined;
const SCRIPT_VERSION =
  typeof __VS_VERSION__ === 'string' ? __VS_VERSION__ : '0.1.0';

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
  const speedStore = createSpeedStore(adapter);
  await settingsStore.init(site);
  await speedStore.init(site);

  // 3. Discovery.
  const cache = createSelectorCache(adapter, {
    scriptVersion: SCRIPT_VERSION,
  });
  await cache.hydrate();
  const discoveryEngine = createDiscoveryEngine({
    site,
    cache,
    validators: Validators,
    isFullChainEnabled: () => killSwitch.isDiscoveryEnabled(),
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
  const lang = settingsStore.getKey('language');
  const i18n: Translator = createTranslator(lang);

  // 5. Stubs for the chicken-and-egg with UiPort + DiagnosticsPort.
  const stubUi: UiPort = {
    refreshButtons: () => {},
    refreshSlider: () => {},
    showNotification: () => {},
    applyLayout: () => {},
  };
  const stubDiagnostics: DiagnosticsPort = {
    report: () => ({} as DiagnosticReport),
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
  const killSwitch = createKillSwitch(ctx);
  const healthChecker = createHealthChecker({
    ctx,
    scriptVersion: SCRIPT_VERSION,
    discovery: discoveryEngine,
    meter,
    killSwitch: killSwitch.snapshot,
    selectorCache: cache,
    isHealthCheckEnabled: killSwitch.isHealthCheckEnabled,
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
      recheck: () => { void healthChecker.runOnce(); },
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
  const realUi = createUiPort({
    panel,
    playerContainer: () => discoveryPort.resolve('playerContainer'),
  });
  ctx.ui = realUi;
  cleanup.add(() => panel.dispose());

  // Re-create translator on language change.
  const offSettingsSub = settingsStore.subscribe((next) => {
    if (next.language !== lang) {
      ctx.i18n = createTranslator(next.language);
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

  // 9. Insert the panel. Retries every 750ms (up to ~15s) because the
  //    player container often appears after document_idle on SPA sites
  //    (RuTube renders the player asynchronously). The retry stops as
  //    soon as we land a real anchor; SPA-navigation listener (step 12)
  //    handles subsequent page changes.
  scheduleInsertWithRetry(panel.element, ctx);
  panel.applyLayout();

  // 9a. Wire the theme watcher AFTER the panel exists so the parent-chain
  //     luminance walk can use the panel as its reference element. The
  //     watcher itself listens to OS theme + host-page attribute changes;
  //     `reapplyTheme` is also invoked manually on each SPA reattach.
  const reapplyTheme = installThemeWatcher(site, ctx, () => panel.element);

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
  ctx.cleanup.addEventListener(
    document,
    'keydown',
    (event) => {
      const ev = event as KeyboardEvent;
      if (shouldSkipHotkey(ev)) return;
      const hk = settingsStore.getKey('hotkeys');
      const v = ctx.discovery.resolve('video') as HTMLVideoElement | null;
      if (matchesHotkeyArray(ev, hk.speedUp)) {
        ev.preventDefault();
        if (v) void setTemporary(ctx, v.playbackRate + SPEED_STEP);
      } else if (matchesHotkeyArray(ev, hk.speedDown)) {
        ev.preventDefault();
        if (v) void setTemporary(ctx, v.playbackRate - SPEED_STEP);
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
    scheduleInsertWithRetry(panel.element, ctx);
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

  // 12b. Re-parent the speed-popup into the fullscreen element so it
  //      stays visible during fullscreen playback. Without this the
  //      popup's `position:absolute` anchor stays in the underlying
  //      document and renders off-screen (audit B2.7).
  cleanup.add(
    installFullscreenReparent(() => discoveryPort.resolve('playerContainer')),
  );

  // 12c. Re-integrate the slider into player chrome on fullscreen
  //      transitions (audit B4.2). When YouTube swaps its chrome layout
  //      between fullscreen and inline, our injected slider gets
  //      detached. Mirror .user.js:2600-2616 — re-run applyLayout after
  //      a 500ms grace so the new chrome has finished mounting.
  ctx.cleanup.addEventListener(document, 'fullscreenchange', () => {
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
      panel.rerenderSettings();
      panel.setGearWarning(!report.healthy);
      logger.debug('health:', report.healthy ? 'ok' : 'warn');
    }),
  );

  logger.info('bootstrap complete');
  void NotificationKindCheck;
}

// Type-only check to keep NotificationKind import used. Kept here so
// future "copy report" handler can read kind from settings.
const NotificationKindCheck: NotificationKind = 'info';

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
function scheduleInsertWithRetry(panelEl: HTMLElement, ctx: AppContext): void {
  const MAX_ATTEMPTS = 16;
  const BASE_DELAY = 500;
  const MAX_DELAY = 5000;
  const BACKOFF = 1.5;
  let attempts = 0;
  let delay = BASE_DELAY;

  function tryOnce(): void {
    attempts += 1;
    let result;
    try {
      result = insertPanel(panelEl, ctx);
    } catch (e) {
      ctx.logger.warn(`insertPanel threw on attempt ${attempts}`, e);
      result = { parent: null, anchor: 'no-anchor' as const };
    }
    const inDoc = document.contains(panelEl);

    if (result.anchor !== 'no-anchor' && inDoc) {
      ctx.logger.info(`panel inserted via ${result.anchor} on attempt ${attempts}`);
      // Watch the parent: SPA frameworks (YouTube ytd-watch-flexy is the
      // worst offender) periodically re-render their children and yank our
      // panel out of the DOM. The observer runs once per removal and
      // re-fires the retry loop -- if the parent itself is gone, the
      // outer observer triggers fresh anchor resolution.
      installRemovalObserver(panelEl, ctx, scheduleInsertWithRetry);
      return;
    }
    if (attempts >= MAX_ATTEMPTS) {
      ctx.logger.warn(`panel insertion failed after ${attempts} attempts; giving up until next SPA nav`);
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
  const observer = new MutationObserver(() => {
    if (panelEl.parentNode !== parent || !document.contains(panelEl)) {
      ctx.logger.info('panel removed from DOM by host framework; re-inserting');
      observer.disconnect();
      reschedule(panelEl, ctx);
      return;
    }
    // Panel is still in the same parent but a sibling changed. Re-run
    // insertPanel — the idempotent guard inside `insertPanel` skips when
    // we're already at the right spot, otherwise it repositions us.
    // Loop-safety relies on `skipOwnPanel(...)` in chooseAnchor: after a
    // successful re-position, the next observer tick computes the same
    // `before` reference and the guard short-circuits without mutating.
    try {
      insertPanel(panelEl, ctx);
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
): void {
  const v = ctx.discovery.resolve('video');
  if (!(v instanceof HTMLVideoElement)) {
    cleanup.setTimeout(() => attachToVideo(ctx, meter, cleanup), 500);
    return;
  }
  type Branded = HTMLVideoElement & { __vsAttached?: boolean; __vsSelfWriteAt?: number };
  if ((v as Branded).__vsAttached) return;
  (v as Branded).__vsAttached = true;

  // Pre-clear smart on fresh attach. Mirror .user.js:2446 — every fresh
  // video binding wipes the temp so an old smart from the previous
  // <video> can't bleed (audit B2.3 / A2.4).
  void ctx.speedStore.setSmart(null);

  let lastSrc = v.currentSrc || v.src || '';
  let isSelfWrite = false;

  const isSite = (s: 'youtube' | 'rutube'): boolean => ctx.site === s;

  /** Recent self-write check: controller stamps `__vsSelfWriteAt` on the
   *  video each time it writes playbackRate. We honour that timestamp
   *  here so click-router writes are not reverted by their own
   *  ratechange callback (audit C2.4). */
  const isFreshSelfWrite = (): boolean => {
    const ts = (v as Branded).__vsSelfWriteAt ?? 0;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return now - ts < SELF_WRITE_GRACE_MS;
  };

  const apply = (reason: string): void => {
    const target = pickInitialSpeed(ctx);
    if (Math.abs(v.playbackRate - target) < 0.005) return;
    isSelfWrite = true;
    // silent: this is an internal correction, user didn't initiate it.
    void setSpeed(ctx, target, { silent: true }).finally(() => { isSelfWrite = false; });
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
    // Skip self-writes when feeding the meter so HealthChecker's "rate
    // resets storm" detection isn't tripped by our own corrections
    // (audit C2.2).
    if (!isSelfWrite && !isFreshSelfWrite()) {
      meter.tick(prev, next);
    }
    prev = next;
    if (isSelfWrite || isFreshSelfWrite()) return;
    const target = pickInitialSpeed(ctx);
    if (Math.abs(next - target) <= 0.005) return;

    if (isSite('youtube')) {
      // External user-driven change via YouTube's own UI → accept.
      void ctx.speedStore.setCurrent(next);
      ctx.ui.refreshButtons(next, { silent: true });
      ctx.ui.refreshSlider(next);
      ctx.logger.info(`ratechange-accept(yt-external): ${target} -> ${next}`);
    } else {
      // Site is reverting; counter-revert after a microtask.
      setTimeout(() => apply('ratechange-revert'), 50);
    }
  });

  // playing-event revert: covers seek + quality switch + tab-resume
  // resets that don't always fire ratechange. .user.js:2477-2501.
  cleanup.addEventListener(v, 'playing', () => {
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
    if (t === 'text' || t === 'search' || t === 'url' || t === 'email' || t === 'password' || t === 'number' || t === 'tel') {
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
