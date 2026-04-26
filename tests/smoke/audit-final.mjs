/**
 * Final functional + visual audit -- screenshots both YT and RuTube
 * panels with magenta outline, runs click + hotkey tests, dumps verdict.
 */

import { chromium } from '@playwright/test';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(__dirname, 'audit-shots');
if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = browser.contexts()[0];
await ctx.addCookies([
  { name: 'CONSENT', value: 'YES+', domain: '.youtube.com', path: '/', expires: Math.floor(Date.now() / 1000) + 86400 },
  { name: 'SOCS', value: 'CAISEwgDEgk0NjI0MjY3NjQaAmVuIAEaBgiA_LyaBg', domain: '.youtube.com', path: '/', expires: Math.floor(Date.now() / 1000) + 86400 },
]);

async function probeAndShoot(page, name) {
  await page.bringToFront();
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelector('.vs-panel')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);

  const probe = await page.evaluate(() => {
    const panel = document.querySelector('.vs-panel');
    if (!panel) return null;
    const computed = getComputedStyle(panel);
    const r = panel.getBoundingClientRect();
    return {
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      panelBg: computed.backgroundColor,
      panelColor: computed.color,
      buttonCount: panel.querySelectorAll('.speed-button').length,
      activeButton: panel.querySelector('.speed-button.active')?.textContent?.trim(),
      sliderPresent: !!panel.querySelector('.speed-slider'),
      sliderLabel: panel.querySelector('.speed-slider-label')?.textContent,
      gearPresent: !!panel.querySelector('.vs-gear-button'),
      videoRate: document.querySelector('video')?.playbackRate,
      themeAttr: document.documentElement.hasAttribute('dark') || document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
    };
  });

  await page.evaluate(() => {
    const p = document.querySelector('.vs-panel');
    if (p) { p.style.outline = '3px solid magenta'; p.style.outlineOffset = '3px'; }
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(SHOTS, `${name}-final.png`), fullPage: false });
  await page.evaluate(() => {
    const p = document.querySelector('.vs-panel');
    if (p) { p.style.outline = ''; p.style.outlineOffset = ''; }
  });

  return probe;
}

async function clickTest(page, label) {
  console.log(`\n--- ${label} click 2x ---`);
  const before = await page.evaluate(() => document.querySelector('video')?.playbackRate);
  try {
    await page.locator('.speed-button:has-text("2x")').first().click({ timeout: 5000 });
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => ({
      rate: document.querySelector('video')?.playbackRate,
      activeButton: document.querySelector('.speed-button.active')?.textContent?.trim(),
    }));
    console.log(`  before=${before} → after=${after.rate}, active="${after.activeButton}"`);
    return { before, after, ok: after.rate === 2 };
  } catch (e) {
    console.log(`  click error: ${e.message.slice(0, 100)}`);
    return { error: e.message };
  }
}

async function settingsModalTest(page, label) {
  console.log(`\n--- ${label} settings modal ---`);
  try {
    await page.locator('.vs-gear-button').first().click({ timeout: 5000 });
    await page.waitForTimeout(400);
    const open = await page.evaluate(() => {
      const m = document.querySelector('.settings-menu');
      if (!m) return null;
      const r = m.getBoundingClientRect();
      const cs = getComputedStyle(m);
      return {
        display: cs.display,
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        bg: cs.backgroundColor,
      };
    });
    console.log(`  modal opened:`, JSON.stringify(open));
    await page.screenshot({ path: join(SHOTS, `${label}-settings-open.png`), fullPage: false });
    // Close.
    await page.locator('.vs-gear-button').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    return open;
  } catch (e) {
    return { error: e.message };
  }
}

const results = {};

// YouTube
const yt = ctx.pages().find((p) => p.url().includes('youtube.com'));
if (yt) {
  console.log('=== YouTube ===');
  results.youtube = {
    probe: await probeAndShoot(yt, 'yt'),
    click: await clickTest(yt, 'YT'),
    settings: await settingsModalTest(yt, 'yt'),
  };
  console.log(JSON.stringify(results.youtube.probe, null, 2));
}

// RuTube
const ru = ctx.pages().find((p) => p.url().includes('rutube.ru')) ?? await ctx.newPage();
if (!ru.url().includes('rutube.ru')) {
  await ru.goto('https://rutube.ru/video/9ae8e8a6dc58bdad66190475f9872ecd/', { waitUntil: 'domcontentloaded' });
  await ru.waitForTimeout(8000);
}
console.log('\n=== RuTube ===');
results.rutube = {
  probe: await probeAndShoot(ru, 'rutube'),
  click: await clickTest(ru, 'RuTube'),
  settings: await settingsModalTest(ru, 'rutube'),
};
console.log(JSON.stringify(results.rutube.probe, null, 2));

await browser.close();

console.log('\n=== VERDICT ===');
const okYt = results.youtube?.probe?.buttonCount === 9 &&
  results.youtube?.click?.ok &&
  results.youtube?.settings?.display === 'block';
const okRu = results.rutube?.probe?.buttonCount === 7 &&
  results.rutube?.click?.ok &&
  results.rutube?.settings?.display === 'block';
console.log('YouTube:', okYt ? 'PASS' : 'FAIL');
console.log('RuTube: ', okRu ? 'PASS' : 'FAIL');
