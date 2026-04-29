/**
 * Generate Chrome Web Store / AMO listing screenshots.
 *
 * CWS spec: 1280x800 (or 640x400) PNG/JPG, recommended 5 images.
 * AMO spec: similar, no hard size; we use 1280x800 universally.
 *
 * Captures (5 store-quality + 2 optional close-ups):
 *   1. YouTube panel default (light theme)
 *   2. YouTube settings modal open
 *   3. Welcome onboarding page (light theme)
 *   4. RuTube panel default (dark theme)
 *   5. RuTube settings modal open
 *
 * Old runs may have produced different scenes (e.g. youtube-panel-highlighted);
 * we wipe the dir up-front to avoid mixing stale and fresh PNGs.
 *
 * Outputs to dist-store-assets/screenshots/.
 */

import { chromium } from '@playwright/test';
import { mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');
const OUT = resolve(REPO, 'dist-store-assets', 'screenshots');
if (!existsSync(OUT)) {
  mkdirSync(OUT, { recursive: true });
} else {
  for (const f of readdirSync(OUT)) {
    if (f.endsWith('.png')) unlinkSync(join(OUT, f));
  }
  console.log(`cleaned ${OUT}`);
}

const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = browser.contexts()[0];

// Inject GDPR-bypass cookies before reloading YT.
await ctx.addCookies([
  { name: 'CONSENT', value: 'YES+', domain: '.youtube.com', path: '/', expires: Math.floor(Date.now() / 1000) + 86400 },
  { name: 'SOCS', value: 'CAISEwgDEgk0NjI0MjY3NjQaAmVuIAEaBgiA_LyaBg', domain: '.youtube.com', path: '/', expires: Math.floor(Date.now() / 1000) + 86400 },
]);

async function setupViewportAndScroll(page) {
  // CWS-spec viewport.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => document.querySelector('.vs-panel')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(500);
}

async function dismissOverlays(page) {
  for (const sel of [
    'button[aria-label*="Принять" i]',
    'button[aria-label*="Accept" i]',
    'button[aria-label*="закрыть" i]',
    'button[aria-label*="close" i]',
    'tp-yt-paper-button:has-text("Принять")',
    'tp-yt-paper-button:has-text("Accept")',
    '[class*="modal"] button[class*="close" i]',
    '[class*="popup"] button[class*="close" i]',
    'button:has-text("Хорошо")',
    'button:has-text("Закрыть")',
  ]) {
    const els = await page.locator(sel).all().catch(() => []);
    for (const el of els) {
      try { await el.click({ timeout: 1000, force: true }); } catch {}
    }
  }
  try { await page.keyboard.press('Escape'); } catch {}
  await page.waitForTimeout(700);
}

let n = 1;
async function shoot(page, name) {
  const file = join(OUT, `${String(n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  console.log(`saved ${file}`);
  n++;
}

/** Crop a tight 1280x400 view of the panel + player neighborhood. */
async function shootPanelClose(page, name) {
  const rect = await page.evaluate(() => {
    const p = document.querySelector('.vs-panel');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return { top: r.top - 360, height: 460 };
  });
  if (!rect) return;
  const file = join(OUT, `${String(n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({
    path: file,
    clip: { x: 0, y: Math.max(0, rect.top), width: 1280, height: rect.height },
  });
  console.log(`saved ${file} (cropped)`);
  n++;
}

const yt = ctx.pages().find((p) => p.url().includes('youtube.com'));
if (yt) {
  console.log('=== YouTube ===');
  await yt.bringToFront();
  // Hard-reload so the consent cookies take effect.
  await yt.reload({ waitUntil: 'domcontentloaded' });
  await yt.waitForTimeout(8000);
  await dismissOverlays(yt);
  await setupViewportAndScroll(yt);
  await shoot(yt, 'youtube-panel-light');
  await shootPanelClose(yt, 'youtube-panel-light-close');

  // Open settings modal.
  await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
  await yt.waitForTimeout(800);
  await shoot(yt, 'youtube-settings-modal');
  await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
  await yt.waitForTimeout(400);
}

// Welcome onboarding page. Discover extension ID from the running browser's
// service workers (chrome-extension://<id>/...). Force prefers-color-scheme:
// light to match the rest of the listing's tonal direction.
const sw = ctx.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
if (sw) {
  console.log('\n=== Welcome ===');
  const extId = new URL(sw.url()).host;
  const welcomeUrl = `chrome-extension://${extId}/welcome.html`;
  const welcome = await ctx.newPage();
  await welcome.emulateMedia({ colorScheme: 'light' });
  await welcome.setViewportSize({ width: 1280, height: 800 });
  await welcome.goto(welcomeUrl, { waitUntil: 'networkidle' });
  // Welcome renders synchronously after script load; give fonts/animations
  // a beat before capture.
  await welcome.waitForTimeout(800);
  await shoot(welcome, 'welcome-page-light');
  await welcome.close();
} else {
  console.warn('skipping welcome shot: no extension service worker found');
}

const ru = ctx.pages().find((p) => p.url().includes('rutube.ru'));
if (ru) {
  console.log('\n=== RuTube ===');
  await ru.bringToFront();
  await ru.waitForTimeout(2000);
  await dismissOverlays(ru);
  // RuTube subscription popup is aggressive; second-pass dismiss after delay.
  await ru.waitForTimeout(2000);
  await dismissOverlays(ru);
  await setupViewportAndScroll(ru);
  await shoot(ru, 'rutube-panel-dark');
  await shootPanelClose(ru, 'rutube-panel-dark-close');

  await ru.evaluate(() => document.querySelector('.vs-gear-button')?.click());
  await ru.waitForTimeout(800);
  await shoot(ru, 'rutube-settings-modal');
  await ru.evaluate(() => document.querySelector('.vs-gear-button')?.click());
}

await browser.close();
console.log(`\nAll screenshots in ${OUT}`);
