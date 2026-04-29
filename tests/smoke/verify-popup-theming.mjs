/**
 * Live verification: open YouTube + RuTube tabs, click extension popup
 * via chrome.action.openPopup-like flow (we navigate to popup.html
 * directly since Playwright can't trigger the toolbar click). Check
 * that data-vs-site and --vs-accent resolve correctly per site.
 */

import { chromium } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');
const EXT_DIR = resolve(REPO, '.output', 'chrome-mv3');

const ctx = await chromium.launchPersistentContext('', {
  headless: false,
  channel: 'chromium',
  viewport: { width: 1280, height: 900 },
  args: [
    `--disable-extensions-except=${EXT_DIR}`,
    `--load-extension=${EXT_DIR}`,
    '--no-first-run',
  ],
});

let extId = null;
for (let i = 0; i < 50; i++) {
  const sw = ctx.serviceWorkers()[0];
  if (sw) { extId = new URL(sw.url()).host; break; }
  await new Promise(r => setTimeout(r, 200));
}
if (!extId) {
  console.error('FAIL: extension service worker did not start');
  await ctx.close();
  process.exit(1);
}

console.log(`extension id: ${extId}`);

// Open YouTube tab so the popup detects it as the active site
const ytPage = ctx.pages()[0] || await ctx.newPage();
await ytPage.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded' });
await ytPage.waitForTimeout(2000);

// Open popup as a new tab (simulates toolbar click for inspection)
const popupYt = await ctx.newPage();
await popupYt.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'networkidle' });
await popupYt.waitForTimeout(800);

const ytData = await popupYt.evaluate(() => {
  const html = document.documentElement;
  const style = getComputedStyle(html);
  return {
    vsSite: html.dataset.vsSite,
    vsTheme: html.dataset.vsTheme,
    accent: style.getPropertyValue('--vs-accent').trim(),
    accentDark: style.getPropertyValue('--vs-accent-dark').trim(),
  };
});
console.log('YouTube popup:', ytData);

// Open RuTube
const rtPage = await ctx.newPage();
await rtPage.goto('https://rutube.ru/', { waitUntil: 'domcontentloaded' });
await rtPage.waitForTimeout(2000);
await rtPage.bringToFront();

const popupRt = await ctx.newPage();
await popupRt.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'networkidle' });
await popupRt.waitForTimeout(800);

const rtData = await popupRt.evaluate(() => {
  const html = document.documentElement;
  const style = getComputedStyle(html);
  return {
    vsSite: html.dataset.vsSite,
    vsTheme: html.dataset.vsTheme,
    accent: style.getPropertyValue('--vs-accent').trim(),
    accentDark: style.getPropertyValue('--vs-accent-dark').trim(),
  };
});
console.log('RuTube popup:', rtData);

await popupYt.screenshot({ path: resolve(__dirname, 'audit-shots/popup-yt.png'), fullPage: true });
await popupRt.screenshot({ path: resolve(__dirname, 'audit-shots/popup-rt.png'), fullPage: true });
console.log('shots saved to audit-shots/popup-yt.png + popup-rt.png');

await ctx.close();
