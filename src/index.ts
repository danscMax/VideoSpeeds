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
} from './ui';
import { showNotification } from './ui/notifications';
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

  // 10. Attach to <video> -- apply initial speed, install ratechange meter.
  attachToVideo(ctx, meter);

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
  const reattach = (): void => {
    for (const v of document.querySelectorAll('video')) {
      delete (v as HTMLVideoElement & { __vsAttached?: boolean }).__vsAttached;
    }
    scheduleInsertWithRetry(panel.element, ctx);
    attachToVideo(ctx, meter);
  };
  if (site === 'youtube') {
    bootstrapYouTubeSite(ctx).onNavigation(reattach);
  } else {
    bootstrapRutubeSite(ctx).onNavigation(reattach);
  }

  // 13. Start health watchdog.
  healthChecker.start();
  // Wire the diagnostic-action buttons to real handlers (panel re-renders
  // settings; the modal handlers receive `onDiag` and we proxy to here).
  cleanup.add(
    healthChecker.subscribe((report) => {
      // Auto-rerender the diag tab when a fresh report lands.
      panel.rerenderSettings();
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
 * Try to insert the panel; retry up to 20 times (every 750ms) when the
 * anchor isn't yet in the DOM. Stops as soon as insertion succeeds OR
 * the retry budget is exhausted. Avoids the body-fallback that the
 * earlier insertion logic produced (panel ended up far below the fold).
 */
function scheduleInsertWithRetry(panelEl: HTMLElement, ctx: AppContext): void {
  const MAX_ATTEMPTS = 20;
  const DELAY_MS = 750;
  let attempts = 0;

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
    ctx.cleanup.setTimeout(tryOnce, DELAY_MS);
  }
  tryOnce();
}

/**
 * Watch for our panel being removed from the document. When a SPA
 * framework (YouTube's ytd-watch-flexy is the canonical case) re-renders
 * its child list, our panel goes with it; this observer notices and
 * re-runs scheduleInsertWithRetry to pick a fresh anchor.
 */
function installRemovalObserver(
  panelEl: HTMLElement,
  ctx: AppContext,
  reschedule: (panel: HTMLElement, ctx: AppContext) => void,
): void {
  const observer = new MutationObserver(() => {
    if (!document.contains(panelEl)) {
      ctx.logger.info('panel removed from DOM by host framework; re-inserting');
      observer.disconnect();
      reschedule(panelEl, ctx);
    }
  });
  // Observing the whole document is cheap (we only react when our
  // specific panel disappears). Subtree+childList covers any ancestor
  // re-render.
  observer.observe(document.documentElement, { childList: true, subtree: true });
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
 */
function attachToVideo(ctx: AppContext, meter: ReturnType<typeof createRatechangeMeter>): void {
  const v = ctx.discovery.resolve('video');
  if (!(v instanceof HTMLVideoElement)) {
    // No video yet -- the discovery engine will resolve once one appears.
    ctx.cleanup.setTimeout(() => attachToVideo(ctx, meter), 500);
    return;
  }
  type Branded = HTMLVideoElement & { __vsAttached?: boolean };
  if ((v as Branded).__vsAttached) return;
  (v as Branded).__vsAttached = true;

  // Track which src we last saw so loadstart can distinguish a real
  // src-change from the constant HLS-segment loadstart storm. Only a
  // src-change should clear smart-speed and re-apply initial.
  let lastSrc = v.currentSrc || v.src || '';
  let isSelfWrite = false;

  const apply = (reason: string): void => {
    const target = pickInitialSpeed(ctx);
    if (Math.abs(v.playbackRate - target) < 0.005) return;
    isSelfWrite = true;
    void setSpeed(ctx, target).finally(() => { isSelfWrite = false; });
    ctx.logger.debug(`attachToVideo: re-applying ${target}x (${reason})`);
  };

  // Initial application + cascading retries to fight HLS init (.user.js:2455-2463).
  if (v.readyState >= 1) {
    apply('ready');
  } else {
    ctx.cleanup.addEventListener(v, 'loadedmetadata', () => apply('loadedmetadata'), { once: true });
  }
  // Multi-shot reapply -- player clobbers the rate during HLS init.
  for (const ms of [100, 300, 500, 1000]) {
    ctx.cleanup.setTimeout(() => apply(`retry+${ms}ms`), ms);
  }

  // ratechange revert protection: when the player snaps rate back to a
  // value that doesn't match our intent, re-apply. We tolerate small
  // float drift (<0.005) to avoid fighting our own writes -- isSelfWrite
  // is also a belt for tight races. Original .user.js:2534-2557.
  let prev = v.playbackRate;
  ctx.cleanup.addEventListener(v, 'ratechange', () => {
    const next = v.playbackRate;
    meter.tick(prev, next);
    prev = next;
    if (isSelfWrite) return;
    const target = pickInitialSpeed(ctx);
    if (Math.abs(next - target) > 0.005) {
      apply('ratechange-revert');
    }
  });

  // playing-event revert: covers seek + quality switch + tab-resume
  // resets that don't always fire ratechange. .user.js:2477-2501.
  ctx.cleanup.addEventListener(v, 'playing', () => {
    if (isSelfWrite) return;
    const target = pickInitialSpeed(ctx);
    if (Math.abs(v.playbackRate - target) > 0.005) {
      apply('playing-revert');
    }
  });

  // loadstart fires on every HLS-segment fetch. Don't clear smart-speed
  // unless this is an actual src change. .user.js:2504-2515.
  ctx.cleanup.addEventListener(v, 'loadstart', () => {
    const nowSrc = v.currentSrc || v.src || '';
    if (nowSrc && nowSrc !== lastSrc) {
      lastSrc = nowSrc;
      void ctx.speedStore.setSmart(null);
      // Re-apply at multiple delays for HLS players that initialise rate
      // late on src change.
      for (const ms of [100, 300, 500, 1000]) {
        ctx.cleanup.setTimeout(() => apply(`src-change+${ms}ms`), ms);
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
