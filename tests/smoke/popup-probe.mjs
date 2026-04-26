/**
 * Popup smoke -- attaches to the running Chromium, finds the extension
 * ID via the Chrome DevTools Protocol's targets list, opens
 * chrome-extension://<id>/popup.html as a tab, and probes its DOM.
 *
 * Verifies the Wave 2 popup mirrors the in-player settings UI.
 */

import { chromium } from '@playwright/test';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = browser.contexts()[0];

// Find the extension via service-worker / background page targets.
// In MV3 service workers may not be running until first request; the
// extension ID is also exposed in chrome://extensions but we can find
// it from chrome.runtime via any page.
const ytPage = ctx.pages().find((p) => p.url().includes('youtube.com'));
if (!ytPage) {
  console.error('No YouTube page open; relaunch Chrome with the smoke recipe');
  process.exit(1);
}

// Discover the extension ID via chrome://extensions. Open it in a tab,
// pierce its shadow DOM to find the extensions-item, and read the id attr.
const extPage = await ctx.newPage();
await extPage.goto('chrome://extensions/', { waitUntil: 'domcontentloaded' });
await extPage.waitForTimeout(1500);

const extId = await extPage.evaluate(() => {
  // chrome://extensions/ uses Polymer/web-components; the items live inside
  // shadow roots. Walk down to find any <extensions-item id="..." />.
  function findItem(root) {
    if (!root) return null;
    const direct = root.querySelector?.('extensions-item');
    if (direct) return direct;
    const shadowHosts = root.querySelectorAll?.('*') ?? [];
    for (const el of shadowHosts) {
      if (el.shadowRoot) {
        const found = findItem(el.shadowRoot);
        if (found) return found;
      }
    }
    return null;
  }
  const item = findItem(document);
  return item?.id ?? null;
});

await extPage.close();

if (!extId) {
  console.error('Could not find extensions-item id in chrome://extensions');
  process.exit(1);
}

console.log('Extension ID:', extId);
const popupUrl = `chrome-extension://${extId}/popup.html`;

const popupPage = await ctx.newPage();
const errors = [];
const initLogs = [];
popupPage.on('console', (m) => {
  const t = m.text();
  if (t.includes('[VIDEO-SPEEDS]')) initLogs.push(`${m.type()}: ${t}`);
});
popupPage.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await popupPage.goto(popupUrl, { waitUntil: 'domcontentloaded' });
await popupPage.waitForTimeout(3_000);

const probe = await popupPage.evaluate(() => {
  return {
    title: document.title,
    hasShell: !!document.querySelector('.vs-popup-shell'),
    hasSettingsMenu: !!document.querySelector('.settings-menu'),
    hasEmptyPlaceholder: !!document.querySelector('.vs-popup-empty'),
    tabs: Array.from(document.querySelectorAll('[data-vs-tab]')).map(
      (b) => b.getAttribute('data-vs-tab'),
    ),
    sliderPosOptions: Array.from(document.querySelectorAll('[data-vs-pos]')).map(
      (b) => b.getAttribute('data-vs-pos'),
    ),
    languageOptions: Array.from(document.querySelectorAll('[data-vs-lang]')).map(
      (b) => b.getAttribute('data-vs-lang'),
    ),
    diagButtons: Array.from(document.querySelectorAll('[data-vs-diag]')).map(
      (b) => b.getAttribute('data-vs-diag'),
    ),
    exportImportPresent:
      !!document.querySelector('[data-vs-action="export"]') &&
      !!document.querySelector('[data-vs-action="import"]'),
    hotkeyInputCount: document.querySelectorAll('.vs-hotkey-input').length,
    bodyText: document.body.textContent?.slice(0, 200) ?? '',
  };
});

console.log('=== popup probe ===');
console.log(JSON.stringify(probe, null, 2));
console.log('\n=== init logs ===');
for (const l of initLogs.slice(0, 5)) console.log(' -', l);
console.log('\n=== errors ===');
console.log(errors.length === 0 ? 'none' : errors);

await popupPage.screenshot({ path: 'tests/smoke/popup-yt.png' });
console.log('\nscreenshot saved tests/smoke/popup-yt.png');

await browser.close();

const verdict =
  probe.hasSettingsMenu &&
  probe.tabs.length === 3 &&
  probe.languageOptions.includes('en') &&
  probe.languageOptions.includes('ru') &&
  probe.exportImportPresent &&
  probe.hotkeyInputCount > 0 &&
  errors.length === 0;
console.log(verdict ? '\nVERDICT: popup smoke PASSED' : '\nVERDICT: popup smoke FAILED');
process.exit(verdict ? 0 : 1);
