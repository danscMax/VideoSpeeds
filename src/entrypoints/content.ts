/**
 * Content script (isolated world).
 *
 * Has access to chrome.* APIs (storage, runtime, etc.) but runs in an isolated
 * JavaScript context separate from the page. For anything that needs to read
 * or patch page-level globals (window.history, localStorage as page sees it,
 * SPA navigation hooks), see entrypoints/page-world.ts which runs in MAIN world.
 */
import { defineContentScript } from 'wxt/utils/define-content-script';

export default defineContentScript({
  matches: [
    '*://*.youtube.com/*',
    '*://rutube.ru/*',
    '*://*.rutube.ru/*',
  ],
  runAt: 'document_idle',
  allFrames: false,
  async main(ctx) {
    console.info('[VIDEO-SPEEDS] content script loaded on', location.hostname);
    const { bootstrap } = await import('../index');
    await bootstrap(ctx);
  },
});
