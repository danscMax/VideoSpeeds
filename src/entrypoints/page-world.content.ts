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

export default defineContentScript({
  matches: ['*://rutube.ru/*', '*://*.rutube.ru/*'],
  runAt: 'document_start',
  world: 'MAIN',
  registration: 'manifest',
  main() {
    try {
      (window as unknown as { __VS_PAGE_WORLD?: string }).__VS_PAGE_WORLD =
        'loaded@' + Date.now();
    } catch {
      /* readonly window? swallow */
    }
    console.info('[VIDEO-SPEEDS] page-world script loaded on', location.hostname);
  },
});
