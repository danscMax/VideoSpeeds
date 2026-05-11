/**
 * Page-world content script (MAIN world).
 *
 * Runs in the same JavaScript context as the host page — has access to the
 * page's `window`, `history`, `localStorage` as the page itself sees them.
 * Does NOT have chrome.* APIs (those only exist in isolated world).
 *
 * SCOPE: RuTube only.
 *   - RuTube React Router patches window.history.pushState in page context.
 *     To intercept those calls (so we re-attach speed controls after SPA
 *     navigation) we must run in the same world the patches live in.
 *   - YouTube is intentionally excluded: its strict Trusted Types CSP blocks
 *     world:'MAIN' content scripts. We don't need MAIN world for YouTube
 *     anyway — yt-navigate-finish is a CustomEvent that crosses the
 *     isolated/main boundary, so the isolated content.ts can observe it
 *     directly.
 *
 * Communication with content.ts (isolated world): window.postMessage with
 * a namespaced `type` field. See utils/page-bridge.ts (TBD).
 *
 * Cross-browser support (audit C4):
 *   - Chrome 95+   declarative `world: 'MAIN'` — confirmed working.
 *   - Firefox 128+ declarative `world: 'MAIN'` — supported per MDN, full
 *     web-ext runtime smoke deferred to Wave 4.
 *   - Older Firefox: silently drops the script. Mitigation = strict_min_version
 *     bump (Wave 4) OR fallback to `injectScript()` from wxt/utils/inject-script
 *     (also Wave 4, requires moving this file out of *.content.ts and
 *     adding it to web_accessible_resources).
 */
import { defineContentScript } from 'wxt/utils/define-content-script';

// Audit 2026-05-11 W5.2 (PLAT-003): versioned envelope. Must match
// bridge-protocol.ts SOURCE. Bump together when the envelope shape
// changes — the isolated side rejects mismatched versions so stale
// page-world closures from a previous protocol can't feed bad data
// into the new schema.
const SOURCE = 'video-speeds@1';
const INSTALL_FLAG = '__vs_historyHookInstalled';

export default defineContentScript({
  matches: ['*://rutube.ru/*', '*://*.rutube.ru/*'],
  runAt: 'document_start',
  world: 'MAIN',
  registration: 'manifest',
  main() {
    // Audit 2026-05-11 W5.1 (PLAT-002): removed `__VS_PAGE_WORLD =
    // "loaded@<timestamp>"` global. It was a passive fingerprint
    // surface — any in-page script (RuTube analytics, ads, widgets)
    // could read it to detect the extension AND get a tab-stable
    // timestamp suitable as a fingerprinting key. INSTALL_FLAG (a
    // boolean private property) is sufficient for idempotency
    // without leaking the timestamp.

    // Install the history hook exactly once per page, regardless of how many
    // isolated content scripts mount/unmount. Audit H3: idempotency flag on
    // pageWindow + sessionId-aware envelope so multiple isolated subscribers
    // can coexist without crossed wires.
    const w = window as unknown as { [INSTALL_FLAG]?: boolean };
    if (w[INSTALL_FLAG]) {
      if (import.meta.env.DEV) {
        console.info('[VIDEO-SPEEDS] page-world: history hook already installed, skipping');
      }
      return;
    }
    w[INSTALL_FLAG] = true;

    const broadcast = (type: 'history-changed' | 'navigated', method: string): void => {
      try {
        window.postMessage(
          { source: SOURCE, sessionId: 'page', type, payload: { method } },
          window.location.origin,
        );
      } catch {
        /* swallow */
      }
    };

    // Primary path: Navigation API (audit C4.1). Modern Chromium ships
    // window.navigation; React-Router and similar SPA routers use it
    // directly. When available, this fires on EVERY navigation including
    // some that pushState patches miss (e.g. soft-redirect routers).
    // We still install the history-patch below as a defensive twin —
    // some routers go through pushState only, and Firefox doesn't ship
    // Navigation API at all yet.
    type NavLike = { addEventListener?: (type: string, fn: () => void) => void };
    const nav = (window as unknown as { navigation?: NavLike }).navigation;
    if (nav && typeof nav.addEventListener === 'function') {
      try {
        nav.addEventListener('navigate', () => {
          Promise.resolve().then(() => broadcast('navigated', 'nav-api'));
        });
        if (import.meta.env.DEV) {
          console.info('[VIDEO-SPEEDS] page-world: Navigation API hook installed');
        }
      } catch {
        /* swallow — fallback to history-patch below */
      }
    }

    for (const method of ['pushState', 'replaceState'] as const) {
      const original = history[method].bind(history);
      history[method] = function patched(...args: unknown[]): void {
        // History.pushState / replaceState are typed with three args
        // upstream; we pass through unchanged via a forced `any` to
        // avoid duplicating the lib.dom signature here.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        original.apply(history, args as any);
        // Microtask defer so the URL is already updated by the time the
        // isolated side handler runs.
        Promise.resolve().then(() => broadcast('history-changed', method));
      } as History[typeof method];
    }
    window.addEventListener('popstate', () => broadcast('navigated', 'popstate'));

    if (import.meta.env.DEV) {
      console.info('[VIDEO-SPEEDS] page-world script loaded on', location.hostname);
    }
  },
});
