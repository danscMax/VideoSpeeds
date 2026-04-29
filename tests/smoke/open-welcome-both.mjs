/**
 * Spawns a Chromium with the unpacked extension loaded and opens TWO
 * welcome.html tabs side by side — one emulating prefers-color-scheme:
 * dark, the other light. Lets the user flip between tabs to compare
 * both themes without touching their OS settings.
 *
 * Stays alive until the browser is closed manually.
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

// Tab 1 — dark
const dark = ctx.pages()[0] || await ctx.newPage();
await dark.emulateMedia({ colorScheme: 'dark' });
await dark.goto(url, { waitUntil: 'domcontentloaded' });

// Tab 2 — light
const light = await ctx.newPage();
await light.emulateMedia({ colorScheme: 'light' });
await light.goto(url, { waitUntil: 'domcontentloaded' });

console.log(`OPENED dark:  ${url}`);
console.log(`OPENED light: ${url}`);
console.log('Switch tabs in the browser to compare. Close the window to exit.');

ctx.on('close', () => {
  console.log('browser closed; exiting');
  process.exit(0);
});

setInterval(() => {}, 1 << 30);
