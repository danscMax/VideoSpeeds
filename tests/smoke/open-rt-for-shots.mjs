// One-shot helper: connect to the debug Chromium on CDP:9333 and open a
// RuTube video tab if none is present. The store-screenshots.mjs run that
// follows then finds it by URL match. Stable RT URL is the same one the
// full-smoke-debug script uses.

import { chromium } from '@playwright/test';

const RT_URL = process.env.RT_URL || 'https://rutube.ru/video/1b3a70fe079819d1b3cb2b0b0212f2a5/';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = browser.contexts()[0];

const existing = ctx.pages().find((p) => p.url().includes('rutube.ru'));
const page = existing ?? (await ctx.newPage());
await page.goto(RT_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
console.log(`navigated to ${RT_URL}`);
// Player + our panel discovery chain need time after navigation.
await page.waitForTimeout(12000);
const panelMounted = await page.evaluate(() => !!document.querySelector('.vs-panel'));
console.log(`panel mounted: ${panelMounted}`);

await browser.close();
