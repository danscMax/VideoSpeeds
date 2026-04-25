/**
 * Page-world content script (MAIN world).
 *
 * Runs in the same JavaScript context as the host page — has access to the
 * page's `window`, `history`, `localStorage` as the page itself sees them.
 * Does NOT have chrome.* APIs (those only exist in isolated world).
 *
 * Why this exists: SPA frameworks like RuTube's React Router patch
 * window.history.pushState in page context. To intercept those calls (so we
 * can re-attach our speed controls after navigation) we have to be in the
 * same world they live in.
 *
 * Communication with content.ts (isolated world): window.postMessage with
 * a namespaced `type` field. See utils/page-bridge.ts (TBD).
 *
 * This is the modern Chrome 95+ alternative to <script>-tag injection via
 * web_accessible_resources. WXT auto-translates `world: 'MAIN'` into the
 * correct manifest entry.
 */
import { defineContentScript } from 'wxt/sandbox';

export default defineContentScript({
  matches: [
    '*://*.youtube.com/*',
    '*://*.piped.video/*',
    '*://rutube.ru/*',
    '*://*.rutube.ru/*',
  ],
  runAt: 'document_start',
  world: 'MAIN',
  registration: 'manifest',
  main() {
    console.info('[VIDEO-SPEEDS] page-world script loaded on', location.hostname);
  },
});
