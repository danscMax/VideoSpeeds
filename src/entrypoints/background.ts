/**
 * MV3 service worker. We only use it for one-shot install hooks — the
 * heavy lifting still lives in the content script. Anything more would
 * pull us into the persistent-vs-event-driven service-worker debate;
 * for now this is a 5-line module.
 *
 * Why we have it:
 *   chrome.runtime.onInstalled is the only Chrome API that fires
 *   exactly once when the user clicks "Add to Chrome" from the
 *   Web Store. We use that signal to open welcome.html in a new tab —
 *   the canonical 2026 onboarding pattern (drops week-1 uninstall,
 *   per the Chrome Best Practices guide). Subsequent updates fire
 *   the same hook with reason='update', which we explicitly ignore
 *   so a Chrome auto-update doesn't barge a tab in front of the
 *   user.
 */

import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

export default defineBackground(() => {
  // FEAT-016: brand the toolbar speed badge (cyan fill, matching the HDRezka
  // twin). Idempotent — runs on every SW wake but is cheap; wrapped because
  // `action` can be briefly unavailable during early startup.
  try {
    void browser.action.setBadgeBackgroundColor({ color: '#0e7490' });
  } catch {
    /* action API not ready — badge still works with the default colour */
  }

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason !== 'install') return;
    const url = browser.runtime.getURL('/welcome.html');
    void browser.tabs.create({ url });
  });

  // Audit 2026-05-11: open-extension-page proxy. Content scripts can't
  // navigate to chrome-extension:// URLs via window.open — the page's
  // own `window` (origin youtube.com / rutube.ru) is treated as the
  // initiator and the target is not in `web_accessible_resources`, so
  // the browser silently drops the open. Routing through the
  // background SW works because the SW owns chrome.tabs and is
  // allowed to create tabs at extension URLs without the `tabs`
  // permission. Reachable from the in-player Settings → "Связаться
  // с автором" CTA; the popup's same button doesn't need this hop
  // (popup origin already matches the extension's), but using the
  // proxy uniformly keeps the call site simple.
  // Strict allow-list of paths the proxy will open. WXT's getURL is
  // statically typed to known public paths, so we narrow on the
  // wire before resolving.
  const ALLOWED_PAGES = new Set(['/feedback.html', '/welcome.html']);
  browser.runtime.onMessage.addListener(
    (msg: unknown, sender): Promise<{ ok: boolean; error?: string }> | undefined => {
      if (!msg || typeof msg !== 'object') return undefined;
      const m = msg as { type?: unknown; path?: unknown; text?: unknown };
      // FEAT-016: the content script mirrors the live playback rate onto the
      // toolbar icon badge. Only the SW can call chrome.action; the sender's
      // tab id targets the right tab. Fire-and-forget — no response channel.
      if (m.type === 'vs:speed-badge') {
        const tabId = sender.tab?.id;
        if (typeof tabId === 'number') {
          const text = typeof m.text === 'string' ? m.text.slice(0, 4) : '';
          browser.action.setBadgeText({ tabId, text }).catch(() => {
            // Tab gone / action API unavailable — best-effort.
          });
        }
        return undefined;
      }
      if (m.type !== 'open-extension-page') return undefined;
      if (typeof m.path !== 'string' || !ALLOWED_PAGES.has(m.path)) {
        return Promise.resolve({ ok: false, error: 'invalid_path' });
      }
      // Cast through the known-paths union after allow-list check.
      const url = browser.runtime.getURL(m.path as '/feedback.html' | '/welcome.html');
      void sender; // explicit no-op: tab.id is unused
      return browser.tabs
        .create({ url })
        .then(() => ({ ok: true }))
        .catch((e: unknown) => ({ ok: false, error: String(e) }));
    },
  );
});
