/**
 * Spawns a Chromium with the unpacked extension loaded and opens the
 * built welcome.html. Stays alive until the user closes the browser
 * window. Used to preview the welcome page when the user's regular
 * Chrome is showing a stale version (extension reload doesn't fire
 * onInstalled, so welcome.html doesn't auto-open).
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

const url = `chrome-extension://${extId}/welcome.html`;
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded' });

console.log(`OPENED: ${url}`);

ctx.on('close', () => {
  console.log('browser closed; exiting');
  process.exit(0);
});

// Keep the process alive indefinitely.
setInterval(() => {}, 1 << 30);
