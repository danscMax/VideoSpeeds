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
  matches: ['*://*.youtube.com/*', '*://rutube.ru/*', '*://*.rutube.ru/*'],
  runAt: 'document_idle',
  allFrames: false,
  async main(ctx) {
    console.info('[VIDEO-SPEEDS] content script loaded on', location.hostname);
    // Backstop: when the extension is reloaded/disabled, in-flight chrome.*
    // calls in the OLD content-script instance reject with "Extension
    // context invalidated" -- these surface in the chrome://extensions
    // errors panel even though nothing is actually broken (the new content
    // script is already running). The adapter swallows the storage path,
    // but WXT internals (runtime.connect, sendMessage) and any future
    // chrome.* calls can still trip the same rejection. Filter at the
    // window level so unrelated rejections are still surfaced.
    // `signal` ties the listener's lifetime to ctx (WXT invalidates on
    // HMR / extension reload). Without it, dev rebuilds accumulate one
    // unhandledrejection filter per cycle.
    window.addEventListener(
      'unhandledrejection',
      (event) => {
        const reason = event.reason;
        const msg = reason instanceof Error ? reason.message : String(reason ?? '');
        if (/extension context (?:was )?invalidated/i.test(msg)) {
          event.preventDefault();
        }
      },
      { signal: ctx.signal },
    );
    const { bootstrap } = await import('../index');
    await bootstrap(ctx);
  },
});
