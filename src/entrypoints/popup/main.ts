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
import type { DiagnosticsPort, DiscoveryPort, Site, UiPort } from '../../app/ports';
import { storageKeysFor } from '../../config';
import type { DiagnosticReport } from '../../health/types';
import { detectBrowserLang } from '../../i18n/detect';
import { createTranslator } from '../../i18n/translator';
import { detectSite } from '../../sites/detect';
import { supportedOrigins } from '../../sites/host-patterns';
import { createBrowserStorageAdapter } from '../../storage/adapter';
import { createSettingsStore } from '../../storage/settings-store';
import { createSpeedStore } from '../../storage/speed-store';
import {
  type ActiveTab,
  attachSettingsHandlers,
  injectStyles,
  renderSettingsMenu,
  showNotification,
} from '../../ui';
import { h } from '../../ui/dom-h';
import { createLogger } from '../../utils/logger';

declare const __VS_VERSION__: string | undefined;
const SCRIPT_VERSION = typeof __VS_VERSION__ === 'string' ? __VS_VERSION__ : '0.1.0';

console.info('[VIDEO-SPEEDS] popup loaded');

const root = document.getElementById('app');
if (root) {
  // Synchronous initial render before any await — matches the WXT React/
  // Vue template pattern. Chrome's toolbar popup samples body height
  // ONCE shortly after the HTML loads; if our async bootstrap has not
  // finished by then, the popup window is sized to whatever is in the
  // DOM at that moment. Putting a properly-sized shell up front means
  // the popup window opens at the natural menu height regardless of
  // how long detectActiveTabSite + storage init take.
  applyPopupTheme();
  renderInitialShell(root);
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

/**
 * Apply light/dark theme to the popup root before any rendering. The
 * popup is in extension chrome (not a host page), so there's no host
 * theme to detect — fall back to the OS-level preferred color scheme.
 * Re-applies live when the user toggles their OS theme.
 */
function applyPopupTheme(): void {
  const apply = (mql: MediaQueryList | MediaQueryListEvent) => {
    document.documentElement.dataset.vsTheme = mql.matches ? 'light' : 'dark';
  };
  const mql = window.matchMedia('(prefers-color-scheme: light)');
  apply(mql);
  // Live-update if the user flips their OS theme while the popup is open.
  mql.addEventListener('change', apply);
}

/**
 * Synchronous skeleton — same outer shape as the final settings menu so
 * the popup window size is correct before any async work completes.
 * Translator hasn't loaded yet, so labels are language-neutral
 * placeholders that get replaced by the real menu in milliseconds.
 */
function renderInitialShell(host: HTMLElement): void {
  host.replaceChildren(
    h(
      'div',
      { class: 'settings-menu vs-popup-skeleton' },
      h('div', { class: 'vs-skel-header' }, h('div', { class: 'vs-skel-line vs-skel-w-60' })),
      h(
        'div',
        { class: 'vs-skel-tabs' },
        h('div', { class: 'vs-skel-pill' }),
        h('div', { class: 'vs-skel-pill' }),
        h('div', { class: 'vs-skel-pill' }),
        h('div', { class: 'vs-skel-pill' }),
      ),
      h(
        'div',
        { class: 'vs-skel-body' },
        h('div', { class: 'vs-skel-line vs-skel-w-40' }),
        h('div', { class: 'vs-skel-block' }),
        h('div', { class: 'vs-skel-line vs-skel-w-40' }),
        h('div', { class: 'vs-skel-block' }),
        h('div', { class: 'vs-skel-line vs-skel-w-40' }),
        h('div', { class: 'vs-skel-row' }),
        h('div', { class: 'vs-skel-row' }),
      ),
    ),
  );
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

  // Tag <html> with the active-tab site so the cascading menu styles
  // (active pills, toggles, segmented control) use the per-site accent
  // — red on YouTube, blue on RuTube. Mirrors the in-player .vs-panel
  // [data-vs-site] approach. Without this attribute the popup falls back
  // to the YouTube-red default declared at :root.
  document.documentElement.dataset.vsSite = site;

  // 2. Build the popup-flavoured context.
  const adapter = createBrowserStorageAdapter();
  const settingsStore = createSettingsStore(adapter);
  const speedStore = createSpeedStore(adapter);
  await settingsStore.init(site);
  await speedStore.init(site);

  const logger = createLogger({ scriptName: 'VS-POPUP' });
  const cleanup = new CleanupRegistry();
  const i18n = createTranslator(settingsStore.getKey('language'));

  // Mirrors the toolbar badge: the icon says "click to allow", so the first
  // thing the click shows must be the way to allow it. Origins come from the
  // manifest — the exact set Firefox lists, and it cannot drift. Unknown state
  // counts as fine; a false alarm on a working install is worse than a missed
  // broken one.
  let missingAccess = false;
  async function refreshMissingAccess(): Promise<void> {
    missingAccess = !(await browser.permissions
      .contains({ origins: supportedOrigins() })
      .catch(() => true));
  }
  await refreshMissingAccess();

  const ui: UiPort = {
    refreshButtons: () => {},
    refreshSlider: () => {},
    showNotification: (text, kind) => showNotification(text, { kind, playerContainer: null }),
    applyLayout: () => {},
  };

  const discovery: DiscoveryPort = {
    hydrate: () => Promise.resolve(),
    resolve: () => null,
    invalidate: () => {},
    cacheStats: () => ({ hits: 0, misses: 0, ready: false }),
  };

  const diagnostics: DiagnosticsPort = {
    report: () => ({}) as DiagnosticReport,
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

  // 3a. Override the OS-based theme guess with whatever the content
  //     script last persisted for this site. injectStyles() above ran
  //     detectAndApplyTheme() which falls back to prefers-color-scheme
  //     (popup has no host-page attributes); but on YouTube the user's
  //     in-page light/dark toggle is the only authoritative signal —
  //     we capture it in lastSeenTheme on the host page side.
  const persistedTheme = settingsStore.getKey('lastSeenTheme');
  if (persistedTheme === 'dark' || persistedTheme === 'light') {
    document.documentElement.dataset.vsTheme = persistedTheme;
  }

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
    // Show the "open the player to run diagnostics" hint only on the
    // Diagnostics tab — on General/Keys/Donate it has no context and just
    // looked like a leaked tooltip pinned to the popup bottom (audit
    // 0.2.0).
    // Hint goes BEFORE the menu when on Diagnostics so the user sees
    // the explanation before reaching for the (greyed-out) action
    // buttons. CSS in popup/style.css disables those buttons in popup
    // context.
    const children: Node[] = [];
    if (missingAccess) {
      const grantBtn = h(
        'button',
        { type: 'button', class: 'vs-popup-grant-btn' },
        ctx.i18n.t('popup.grant.button'),
      );
      grantBtn.addEventListener('click', () => {
        // No await before the request: Firefox only honours it while the
        // click's user-gesture token is alive.
        void browser.permissions
          .request({ origins: supportedOrigins() })
          .then((granted) => {
            if (!granted) return;
            void refreshMissingAccess().then(rerender);
          })
          .catch(() => undefined);
      });
      children.push(
        h(
          'div',
          { class: 'vs-popup-grant' },
          h('div', { class: 'vs-popup-grant-title' }, ctx.i18n.t('popup.grant.title')),
          h('div', { class: 'vs-popup-grant-body' }, ctx.i18n.t('popup.grant.body')),
          grantBtn,
        ),
      );
    }
    if (activeTab === 'diag') {
      children.push(
        h(
          'div',
          { class: 'vs-popup-diag-hint vs-popup-diag-hint-top' },
          ctx.i18n.t('diag.popup_hint'),
        ),
      );
    }
    // FEAT-021: quick speed row — change the video's speed right from
    // the toolbar without opening the in-player menu. Buttons highlight
    // once the live speed is known.
    {
      const presets = settingsStore.getKey('speedPresets') ?? [];
      if (presets.length > 0) {
        const quickRow = h(
          'div',
          { class: 'vs-popup-quick', title: ctx.i18n.t('popup.quick.tip') },
          ...presets.map((s) =>
            h(
              'button',
              { type: 'button', class: 'speed-button vs-popup-quick-btn', 'data-vs-speed': s },
              `${s}x`,
            ),
          ),
        );
        const highlight = (speed: number | null): void => {
          for (const b of quickRow.querySelectorAll<HTMLButtonElement>('.vs-popup-quick-btn')) {
            const v = parseFloat(b.dataset.vsSpeed ?? '');
            b.classList.toggle(
              'active',
              speed !== null && Number.isFinite(v) && Math.abs(v - speed) < 0.005,
            );
          }
        };
        quickRow.addEventListener('click', (event) => {
          const btn = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
            '.vs-popup-quick-btn',
          );
          if (!btn) return;
          const speed = parseFloat(btn.dataset.vsSpeed ?? '');
          if (!Number.isFinite(speed)) return;
          void sendSpeedMessage({ type: 'vs:set-speed', speed }).then((applied) => {
            if (applied === null) {
              ui.showNotification(ctx.i18n.t('popup.quick.no_video'), 'info');
            } else {
              highlight(applied);
            }
          });
        });
        void sendSpeedMessage({ type: 'vs:get-speed' }).then(highlight);
        children.push(quickRow);
      }
    }
    children.push(menu);
    host.replaceChildren(...children);
    attachSettingsHandlers(menu, ctx, {
      setActiveTab: (t) => {
        activeTab = t;
      },
      rerender,
      onDiag: async (action) => {
        if (action === 'recheck') {
          const report = await sendToActiveTab({ type: 'vs:recheck' });
          if (report) {
            applyReportToMenu(menu, ctx.i18n, report);
            ui.showNotification(
              report.healthy ? ctx.i18n.t('toast.diag_ok') : ctx.i18n.t('toast.diag_issues'),
              report.healthy ? 'info' : 'warn',
            );
          } else {
            ui.showNotification(ctx.i18n.t('diag.popup_hint'), 'info');
          }
          return;
        }
        if (action === 'copy') {
          const report = await sendToActiveTab({ type: 'vs:get-status' });
          if (report) {
            try {
              await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
              ui.showNotification(ctx.i18n.t('toast.report_copied'), 'info');
            } catch {
              ui.showNotification(ctx.i18n.t('toast.report_copy_failed'), 'error');
            }
          } else {
            ui.showNotification(ctx.i18n.t('diag.popup_hint'), 'info');
          }
          return;
        }
        if (action === 'purge-cache') {
          const ok = await sendToActiveTab({ type: 'vs:purge-cache' });
          ui.showNotification(
            ok ? ctx.i18n.t('toast.cache_cleared') : ctx.i18n.t('diag.popup_hint'),
            ok ? 'info' : 'warn',
          );
          return;
        }
        // full-reset stays gear-only.
        ui.showNotification(ctx.i18n.t('diag.popup_hint'), 'info');
      },
    });

    // Force a fresh recheck on Diagnostics tab open so popup and gear
    // menu always agree on the report. get-status returns the cached
    // last-report which can lag the gear-menu live one by a couple
    // of seconds and produced contradictory readings between the
    // two surfaces.
    if (activeTab === 'diag') {
      void sendToActiveTab({ type: 'vs:recheck' }).then((report) => {
        if (report) applyReportToMenu(menu, ctx.i18n, report);
      });
    }
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
  //
  // Filtered to settings/speed keys only — HealthChecker writes
  // selector-cache entries on every recheck, and the recheck the
  // popup itself fires on Diagnostics open used to flicker the whole
  // menu (audit 0.2.7).
  const settingsKeys = new Set([
    storageKeysFor('youtube').settings,
    storageKeysFor('youtube').speed,
    storageKeysFor('rutube').settings,
    storageKeysFor('rutube').speed,
  ]);
  let pendingRerender: ReturnType<typeof setTimeout> | null = null;
  const storageListener = (changes: Record<string, unknown>): void => {
    if (changes.__vs_skip__) return;
    const changedKeys = Object.keys(changes);
    if (!changedKeys.some((k) => settingsKeys.has(k))) return;
    if (pendingRerender !== null) clearTimeout(pendingRerender);
    pendingRerender = setTimeout(() => {
      pendingRerender = null;
      rerender();
    }, 50);
  };
  browser.storage.local.onChanged.addListener(storageListener);
  cleanup.add(() => {
    if (pendingRerender !== null) clearTimeout(pendingRerender);
    browser.storage.local.onChanged.removeListener(storageListener);
  });

  rerender();
}

async function detectActiveTabSite(): Promise<Site | null> {
  try {
    const ourPopupPrefix = browser.runtime.getURL('/popup.html');
    const matches = (t: { url?: string }): boolean => {
      if (!t.url || t.url.startsWith(ourPopupPrefix)) return false;
      try {
        return detectSite(new URL(t.url).hostname) !== null;
      } catch {
        return false;
      }
    };

    // Strategy ladder, in order of authority:
    //   1) The toolbar popup runs in `currentWindow` and resolves to the
    //      window that owns the toolbar button. {active:true, currentWindow:true}
    //      gives us THE tab the user was looking at when they clicked.
    //      Earlier we used `tabs.query({})` and `.find()` which matched
    //      any supported tab in any window — on a multi-window setup with
    //      both YouTube and RuTube open it locked onto whichever Chrome
    //      enumerated first (audit 0.2.0).
    //   2) `lastFocusedWindow:true` covers the dev-tab case (popup opened
    //      directly as `chrome-extension://<id>/popup.html` for testing).
    //   3) Last-resort fallback to any supported tab in any window — at
    //      least gives the user *some* settings rather than the empty-
    //      placeholder when both windows have the popup-as-page URL active.
    const queries = [
      { active: true, currentWindow: true },
      { active: true, lastFocusedWindow: true },
      {},
    ] as const;
    for (const q of queries) {
      const tabs = await browser.tabs.query(q);
      const hit = tabs.find(matches);
      if (hit?.url) return detectSite(new URL(hit.url).hostname);
    }
    return null;
  } catch {
    return null;
  }
}

function renderNoSitePlaceholder(host: HTMLElement): void {
  // Falls back to the user's browser language because we can't read settings
  // without knowing the site (settings are per-site).
  const lang = detectBrowserLang();
  const t = createTranslator(lang).t;
  const subline =
    lang === 'ru'
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

/** FEAT-021: speed read/write channel for the popup quick-actions row. */
async function sendSpeedMessage(message: {
  type: 'vs:get-speed' | 'vs:set-speed';
  speed?: number;
}): Promise<number | null> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (typeof tabId !== 'number') return null;
    const res = (await browser.tabs.sendMessage(tabId, message)) as
      | { ok: boolean; speed?: number }
      | undefined;
    if (!res?.ok || typeof res.speed !== 'number') return null;
    return res.speed;
  } catch {
    return null;
  }
}

async function sendToActiveTab(message: {
  type: 'vs:recheck' | 'vs:get-status';
}): Promise<DiagnosticReport | null>;
async function sendToActiveTab(message: { type: 'vs:purge-cache' }): Promise<boolean>;
async function sendToActiveTab(message: {
  type: string;
}): Promise<DiagnosticReport | boolean | null> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (typeof tabId !== 'number') return null;
    const res = (await browser.tabs.sendMessage(tabId, message)) as
      | { ok: boolean; report?: DiagnosticReport; error?: string }
      | undefined;
    if (!res?.ok) return null;
    if (message.type === 'vs:purge-cache') return true;
    return res.report ?? null;
  } catch {
    return null;
  }
}

function applyReportToMenu(
  menuRoot: Element,
  i18n: { t: (key: string, vars?: Record<string, string | number>) => string },
  report: DiagnosticReport,
): void {
  const statusEl = menuRoot.querySelector<HTMLElement>('[data-vs-diag-status]');
  const headlineEl = menuRoot.querySelector<HTMLElement>('[data-vs-diag-headline]');
  const detailEl = menuRoot.querySelector<HTMLElement>('[data-vs-diag-detail]');
  if (!statusEl || !headlineEl || !detailEl) return;

  const r = report as unknown as Record<string, unknown>;
  const waiting = r.isWaiting === true;
  const healthy = r.healthy === true;
  const issues = Array.isArray(r.issues) ? (r.issues as string[]) : [];
  const lastCheckTime = typeof r.lastCheckTime === 'string' ? r.lastCheckTime : '';

  if (waiting) {
    statusEl.dataset.state = 'waiting';
    headlineEl.textContent = i18n.t('diag.status.waiting');
    detailEl.textContent = i18n.t('diag.status.waiting_detail');
    return;
  }
  if (healthy) {
    statusEl.dataset.state = 'ok';
    headlineEl.textContent = i18n.t('diag.status.ok');
    detailEl.textContent = lastCheckTime
      ? i18n.t('diag.status.last_check', { time: lastCheckTime })
      : '';
    return;
  }
  statusEl.dataset.state = 'warn';
  if (issues.length === 1) {
    headlineEl.textContent = i18n.t('diag.status.issue_single', { issue: issues[0] ?? '' });
    detailEl.textContent = i18n.t('diag.status.try_again');
  } else {
    // Audit 2026-05-09 Q2: pluralized key — `.one` if count===1, `.other` otherwise.
    const issuesCountKey =
      issues.length === 1 ? 'diag.status.issues_count.one' : 'diag.status.issues_count.other';
    headlineEl.textContent = i18n.t(issuesCountKey, { count: issues.length });
    detailEl.textContent =
      issues.length > 0 ? issues.map((s) => `• ${s}`).join('\n') : i18n.t('diag.status.try_again');
  }
}
