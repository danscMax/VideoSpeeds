/**
 * Content script (isolated world).
 *
 * Has access to chrome.* APIs (storage, runtime, etc.) but runs in an isolated
 * JavaScript context separate from the page. For anything that needs to read
 * or patch page-level globals (window.history, localStorage as page sees it,
 * SPA navigation hooks), see entrypoints/page-world.ts which runs in MAIN world.
 */
import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';

// Touching `browser` here keeps tree-shaking honest: we want the WXT runtime
// shim included so that downstream porting waves can import it without a
// per-entrypoint roundtrip. The `void` cast also confirms the type is wired.
void browser;

export default defineContentScript({
  matches: [
    '*://*.youtube.com/*',
    '*://rutube.ru/*',
    '*://*.rutube.ru/*',
  ],
  runAt: 'document_idle',
  allFrames: false,
  async main() {
    // Initial sanity log — confirms the script is injected and TS toolchain works.
    // Will be replaced with the full init pipeline in subsequent porting waves.
    console.info('[VIDEO-SPEEDS] content script loaded on', location.hostname);
  },
});
