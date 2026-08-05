/**
 * Renders Chrome Web Store / AMO listing screenshots for VideoSpeeds.
 *
 * Produces five 1280×800 JPEGs (CWS-required format — exactly that
 * resolution, no alpha channel):
 *   01-youtube-panel.jpg    — full mock YouTube watch page with the panel
 *   02-youtube-settings.jpg — same page with the settings modal open
 *   03-rutube-panel.jpg     — full mock RuTube watch page with the panel
 *   04-rutube-settings.jpg  — same page with the settings modal open
 *   05-welcome-page.jpg     — extension's actual welcome.html
 *
 * How this works (v0.3.5+):
 *   1. Chromium is launched with the unpacked extension loaded.
 *   2. The two mock files (mock-youtube.html / mock-rutube.html) contain
 *      ONLY the host-page chrome — masthead, player surface, dummy
 *      `<video>`, and the layout anchors the DiscoveryEngine looks for
 *      (`ytd-watch-metadata` for YT, `[class*="videoTitleSection"]` for
 *      RuTube). They DO NOT include any extension HTML or CSS.
 *   3. Playwright intercepts requests for fake youtube.com / rutube.ru
 *      URLs and serves the local HTML. The browser sees the URL as the
 *      live host, content scripts auto-fire because they match
 *      `*://*.youtube.com/*` / `*://rutube.ru/*`.
 *   4. The extension bootstraps and injects its real `.vs-panel` into
 *      the page. Every UI feature in src/ui (brand marker, pinned
 *      indicator, grouped preset chips, etc.) shows up automatically —
 *      no mock to keep in sync.
 *   5. For the settings shot we click the gear button and wait for the
 *      menu to mount.
 */

import { chromium } from '@playwright/test';
import { mkdirSync, existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');
const OUT = resolve(REPO, 'dist-store-assets', 'screenshots');
const MOCK_YT_PATH = resolve(__dirname, 'mock-youtube.html');
const MOCK_RT_PATH = resolve(__dirname, 'mock-rutube.html');
const EXT_DIR = resolve(REPO, '.output', 'chrome-mv3');

if (!existsSync(EXT_DIR)) {
  console.error(`Extension build missing: ${EXT_DIR}\nRun \`npm run build\` first.`);
  process.exit(1);
}

if (!existsSync(OUT)) {
  mkdirSync(OUT, { recursive: true });
} else {
  for (const f of readdirSync(OUT)) {
    if (/\.(png|jpe?g)$/i.test(f)) unlinkSync(join(OUT, f));
  }
  console.log(`cleaned ${OUT}`);
}

const MOCK_YT = readFileSync(MOCK_YT_PATH, 'utf-8');
const MOCK_RT = readFileSync(MOCK_RT_PATH, 'utf-8');
const YT_URL = 'https://www.youtube.com/watch?v=storeMockId12345';
const RT_URL = 'https://rutube.ru/video/storeMockId12345/';

const userDataDir = resolve(__dirname, '.tmp-profile');
const ctx = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${EXT_DIR}`,
    `--load-extension=${EXT_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    // Force English UI so the panel + modal i18n picks 'en'
    // (detectBrowserLang reads navigator.languages). Store listings
    // target an international audience, Russian copy is a regression.
    '--lang=en-US',
  ],
  locale: 'en-US',
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});

let n = 1;
async function shoot(page, name) {
  const file = join(OUT, `${String(n).padStart(2, '0')}-${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
  console.log(`saved ${file}`);
  n++;
}

/**
 * Build a route handler that fulfills the host URL with the mock body
 * and aborts everything else (no real network, no third-party assets).
 */
function makeRoute(url, body) {
  return async (route) => {
    const u = route.request().url();
    if (u === url) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body,
      });
    } else if (u.startsWith('chrome-extension://') || u.startsWith('data:')) {
      await route.continue();
    } else {
      await route.abort();
    }
  };
}

/**
 * Capture a panel + settings shot pair against a host URL.
 */
async function captureHost(label, url, mockBody, scrollSettingsTo = 0) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route('**/*', makeRoute(url, mockBody));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('.vs-panel', { timeout: 15000 });
  await page.waitForTimeout(800);
  // The first-run hint chip is correct behaviour on a fresh profile — and
  // exactly wrong in a store screenshot, where it lands half-covered by the
  // settings modal and reads as a rendering glitch. Remove it before every
  // shot; the profile is throwaway anyway.
  await page.evaluate(() => document.getElementById('speed-notifications')?.remove());
  await shoot(page, `${label}-panel`);

  await page.click('.vs-gear-button');
  await page
    .waitForSelector('.settings-menu.show, .settings-menu[aria-hidden="false"]', { timeout: 5000 })
    .catch(() => null);
  await page.waitForTimeout(400);
  // The RuTube shot exists to show the RuTube-only toggles ("hide player
  // title", "hide Premium banners"). They sit below the fold of the modal, so
  // the un-scrolled capture showed a generic General tab and the listing's
  // caption promised something the image did not contain.
  if (scrollSettingsTo > 0) {
    await page.evaluate((top) => {
      const body = document.querySelector('.settings-menu .vs-menu-body');
      if (body) body.scrollTop = top;
    }, scrollSettingsTo);
    await page.waitForTimeout(300);
  }
  await page.evaluate(() => document.getElementById('speed-notifications')?.remove());
  await shoot(page, `${label}-settings`);
  await page.close();
}

await captureHost('youtube', YT_URL, MOCK_YT);
await captureHost('rutube', RT_URL, MOCK_RT, 620);

// 5. Welcome — through the built extension.
let extId = null;
for (let i = 0; i < 30 && !extId; i++) {
  const sw = ctx.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  if (sw) {
    extId = new URL(sw.url()).host;
    break;
  }
  await new Promise((r) => setTimeout(r, 200));
}

if (extId) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(`chrome-extension://${extId}/welcome.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shoot(page, 'welcome-page');
} else {
  console.warn('welcome-page skipped: extension service worker not found');
}

await ctx.close();

try {
  const { rmSync } = await import('node:fs');
  rmSync(userDataDir, { recursive: true, force: true });
} catch { /* swallow */ }

console.log(`\nAll screenshots in ${OUT}`);
