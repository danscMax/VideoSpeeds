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
import { SPEED_STEP } from './config';
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
  const panel = createPanel({ ctx, scriptVersion: SCRIPT_VERSION });
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
  ctx.cleanup.addEventListener(
    document,
    'keydown',
    (event) => {
      const ev = event as KeyboardEvent;
      const hk = settingsStore.getKey('hotkeys');
      if (matchesHotkeyArray(ev, hk.speedUp)) {
        const v = ctx.discovery.resolve('video') as HTMLVideoElement | null;
        if (v) void setSpeed(ctx, v.playbackRate + SPEED_STEP);
      } else if (matchesHotkeyArray(ev, hk.speedDown)) {
        const v = ctx.discovery.resolve('video') as HTMLVideoElement | null;
        if (v) void setSpeed(ctx, v.playbackRate - SPEED_STEP);
      }
    },
    { capture: true },
  );

  // 12. Site-specific navigation listener -> re-insert + re-apply.
  const reattach = (): void => {
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
  // Suppress the unused-binding warning for rare branches; reportToClipboardText
  // is wired into the diag "copy" button by Wave 1.10.5 follow-up.
  void reportToClipboardText;
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
 * Apply the chosen initial speed once the video element is ready, and
 * install a ratechange listener that feeds the meter (audit M for the
 * RuTube/HDRezka rate-resets storm detection in HealthChecker).
 */
function attachToVideo(ctx: AppContext, meter: ReturnType<typeof createRatechangeMeter>): void {
  const v = ctx.discovery.resolve('video');
  if (!(v instanceof HTMLVideoElement)) {
    // No video yet -- the discovery engine will resolve once one appears.
    // Try once more shortly; site-specific re-attach will also fire.
    ctx.cleanup.setTimeout(() => attachToVideo(ctx, meter), 500);
    return;
  }
  if ((v as HTMLVideoElement & { __vsAttached?: boolean }).__vsAttached) return;
  (v as HTMLVideoElement & { __vsAttached?: boolean }).__vsAttached = true;

  const apply = (): void => {
    const initial = pickInitialSpeed(ctx);
    void setSpeed(ctx, initial);
  };
  if (v.readyState >= 1) {
    apply();
  } else {
    ctx.cleanup.addEventListener(v, 'loadedmetadata', apply);
  }

  let prev = v.playbackRate;
  ctx.cleanup.addEventListener(v, 'ratechange', () => {
    const next = v.playbackRate;
    meter.tick(prev, next);
    prev = next;
  });

  // Reset smart speed on src change (new video starts fresh).
  ctx.cleanup.addEventListener(v, 'loadstart', () => {
    void ctx.speedStore.setSmart(null);
  });

  // Mark unused-suppress for setTemporary; it's used by handlers via the
  // controller already, just keep the import alive.
  void setTemporary;
}
