/**
 * Popup entrypoint -- mirrors the in-player gear-menu so the user can
 * tweak settings without opening a video.
 *
 * Architecture:
 *   - Detect the active tab via browser.tabs.query (no broad `tabs`
 *     permission needed; URL access uses the activeTab grant from the
 *     toolbar click). Audit H9.
 *   - Build a popup-flavoured AppContext: real SettingsStore + SpeedStore
 *     reading the same browser.storage.local the content script writes,
 *     no UiPort/discovery (no video here), no panel.
 *   - Render the SAME settings modal template via renderSettingsMenu, but
 *     the diagnostics tab swaps in a "view diagnostics in the player"
 *     hint because there's no video / health-checker context here.
 *   - SettingsStore.subscribe() on storage.onChanged would be ideal; for
 *     now the popup mirrors content-script writes by re-init on focus.
 */

import { browser } from 'wxt/browser';
import { CleanupRegistry } from '../../app/cleanup';
import type { AppContext } from '../../app/context';
import { createBrowserStorageAdapter } from '../../storage/adapter';
import { createSettingsStore } from '../../storage/settings-store';
import { createSpeedStore } from '../../storage/speed-store';
import { detectSite } from '../../sites/detect';
import {
  attachSettingsHandlers,
  injectStyles,
  renderSettingsMenu,
  showNotification,
  type ActiveTab,
} from '../../ui';
import { h } from '../../ui/dom-h';
import { createTranslator } from '../../i18n/translator';
import { detectBrowserLang } from '../../i18n/detect';
import { createLogger } from '../../utils/logger';
import type {
  DiagnosticsPort,
  DiscoveryPort,
  Site,
  UiPort,
} from '../../app/ports';
import type { DiagnosticReport } from '../../health/types';

declare const __VS_VERSION__: string | undefined;
const SCRIPT_VERSION =
  typeof __VS_VERSION__ === 'string' ? __VS_VERSION__ : '0.1.0';

console.info('[VIDEO-SPEEDS] popup loaded');

const root = document.getElementById('app');
if (root) {
  void bootstrapPopup(root).catch((e) => {
    console.error('[VIDEO-SPEEDS] popup bootstrap failed', e);
    root.replaceChildren(
      h(
        'div',
        { class: 'vs-popup-empty' },
        h('span', { class: 'vs-popup-empty-title' }, 'Failed to load'),
        ' ',
        String(e?.message ?? e),
      ),
    );
  });
}

async function bootstrapPopup(host: HTMLElement): Promise<void> {
  // 1. Detect which site the active tab is on. activeTab grant from the
  //    toolbar click gives us URL access for THIS click only.
  const detected = await detectActiveTabSite();
  if (!detected) {
    renderNoSitePlaceholder(host);
    return;
  }
  const site: Site = detected;

  // 2. Build the popup-flavoured context.
  const adapter = createBrowserStorageAdapter();
  const settingsStore = createSettingsStore(adapter);
  const speedStore = createSpeedStore(adapter);
  await settingsStore.init(site);
  await speedStore.init(site);

  const logger = createLogger({ scriptName: 'VS-POPUP' });
  const cleanup = new CleanupRegistry();
  const i18n = createTranslator(settingsStore.getKey('language'));

  const ui: UiPort = {
    refreshButtons: () => {},
    refreshSlider: () => {},
    showNotification: (text, kind) =>
      showNotification(text, { kind, playerContainer: null }),
    applyLayout: () => {},
  };

  const discovery: DiscoveryPort = {
    hydrate: () => Promise.resolve(),
    resolve: () => null,
    invalidate: () => {},
    cacheStats: () => ({ hits: 0, misses: 0, ready: false }),
  };

  const diagnostics: DiagnosticsPort = {
    report: () => ({} as DiagnosticReport),
    isHealthy: () => true,
    killSwitchEngaged: () => false,
    trip: () => {},
  };

  const ctx: AppContext = {
    site,
    settingsStore,
    speedStore,
    ui,
    discovery,
    diagnostics,
    cleanup,
    logger,
    i18n,
  };

  // 3. Inject the in-player CSS (same selectors -- the popup-style.css
  //    overrides .settings-menu positioning so it fills the popup body
  //    instead of floating).
  injectStyles(site);

  // 4. Render. activeTab persists across re-renders.
  let activeTab: ActiveTab = 'general';
  function rerender(): void {
    const menu = h(
      'div',
      { class: 'settings-menu' },
      renderSettingsMenu({
        settings: settingsStore.get(),
        site,
        i18n: ctx.i18n,
        activeTab,
        scriptVersion: SCRIPT_VERSION,
        // KillSwitch flags are content-script-side; popup just shows them.
        discoveryEnabled: true,
        healthCheckEnabled: true,
      }),
    );
    host.replaceChildren(
      menu,
      h(
        'div',
        { class: 'vs-popup-diag-hint' },
        ctx.i18n.t('diag.btn.recheck.tip'),
      ),
    );
    attachSettingsHandlers(menu, ctx, {
      setActiveTab: (t) => { activeTab = t; },
      rerender,
      onDiag: () => {
        // Popup can't run live diagnostics; nudge user to in-player gear.
        ui.showNotification(
          ctx.i18n.t('diag.status.click_to_check'),
          'info',
        );
      },
    });
  }

  // Re-init translator on language switch. Subscriber fires on every
  // update; rebuilding the translator is cheap (~150 keys).
  cleanup.add(
    settingsStore.subscribe((next) => {
      ctx.i18n = createTranslator(next.language as 'en' | 'ru');
    }),
  );

  // 5. Listen for storage.onChanged so the popup reflects edits made in
  //    the in-player gear without needing a manual refresh.
  const storageListener = (changes: Record<string, unknown>): void => {
    if (changes['__vs_skip__']) return;
    rerender();
  };
  browser.storage.local.onChanged.addListener(storageListener);
  cleanup.add(() => browser.storage.local.onChanged.removeListener(storageListener));

  rerender();
}

async function detectActiveTabSite(): Promise<Site | null> {
  try {
    // Two query strategies:
    //   1) currentWindow=true       -- works when popup is opened via the
    //                                  toolbar action (popup is "attached"
    //                                  to the browser window, currentWindow
    //                                  resolves to the parent).
    //   2) lastFocusedWindow=true   -- fallback for testing/debug where the
    //                                  popup is opened directly as a tab.
    //   Either way we ignore matches that point at our own popup URL --
    //   that means we picked up the popup's own tab and need a different
    //   answer.
    const ourPopupPrefix = browser.runtime.getURL('/popup.html');
    const candidates = await browser.tabs.query({});
    const supported = candidates.find((t) => {
      if (!t.url || t.url.startsWith(ourPopupPrefix)) return false;
      try {
        return detectSite(new URL(t.url).hostname) !== null;
      } catch {
        return false;
      }
    });
    if (!supported?.url) return null;
    return detectSite(new URL(supported.url).hostname);
  } catch {
    return null;
  }
}

function renderNoSitePlaceholder(host: HTMLElement): void {
  // Falls back to the user's browser language because we can't read settings
  // without knowing the site (settings are per-site).
  const lang = detectBrowserLang();
  const t = createTranslator(lang).t;
  const subline = lang === 'ru'
    ? 'Откройте YouTube или RuTube, чтобы открыть настройки.'
    : 'Open YouTube or RuTube to access settings.';
  host.replaceChildren(
    h(
      'div',
      { class: 'vs-popup-empty' },
      h('span', { class: 'vs-popup-empty-title' }, 'Video Speed Controller'),
      ' ',
      t('tabs.general.tip'),
      h('div', { style: 'margin-top:12px;font-size:11px;opacity:0.55;' }, subline),
    ),
  );
}
