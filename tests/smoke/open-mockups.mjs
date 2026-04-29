/**
 * Quickly opens the pill-grid + toggle mockup file in a fresh Chromium
 * tab so the user can compare variants side-by-side without manually
 * navigating to a file:// URL.
 */

import { chromium } from '@playwright/test';

const ctx = await chromium.launchPersistentContext('', {
  headless: false,
  channel: 'chromium',
  viewport: { width: 1280, height: 900 },
  args: ['--no-first-run'],
});

const page = ctx.pages()[0] || await ctx.newPage();
await page.goto('file:///C:/Temp/vs-light-pills-toggles-mockups.html', { waitUntil: 'domcontentloaded' });

console.log('OPENED: C:/Temp/vs-light-pills-toggles-mockups.html');

ctx.on('close', () => process.exit(0));
setInterval(() => {}, 1 << 30);
