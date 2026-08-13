/**
 * Records the Product Hunt / landing-page demo clip for VideoSpeeds.
 *
 *   node tools/promo-video.mjs        (needs `npm run build` first)
 *
 * Output: dist-store-assets/social/demo.mp4 — 1280x720, ~22s, no audio.
 *
 * Why a recording and not the old demo.gif: that GIF was captured 2026-07-11,
 * before Dzen, VK and Shorts existed and before the rename. Looping it would
 * have advertised a product that no longer matches the listing.
 *
 * How it works — same trick as tests/store-screenshots/render.mjs: Chromium
 * runs with the unpacked extension, Playwright serves local mock pages under
 * the real host URLs so the content scripts fire, and the extension injects
 * its actual UI. Nothing here is a mock-up of the interface; every pixel of
 * the panel is the shipping code.
 *
 * Playwright writes webm per context; ffmpeg transcodes to mp4 (H.264 +
 * yuv420p, which is what Product Hunt and every social preview accept).
 */

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const MOCKS = resolve(REPO, 'tests', 'store-screenshots');
const OUT_DIR = resolve(REPO, 'dist-store-assets', 'social');
const RAW_DIR = resolve(REPO, '.output', 'promo-video');
const EXT_DIR = resolve(REPO, '.output', 'chrome-mv3');
const OUT_MP4 = join(OUT_DIR, 'demo.mp4');

if (!existsSync(EXT_DIR)) {
  console.error(`Extension build missing: ${EXT_DIR}\nRun \`npm run build\` first.`);
  process.exit(1);
}

/** Host URL -> local mock. One route handler serves all of them. */
const PAGES = {
  'https://www.youtube.com/watch?v=storeMockId12345': readFileSync(
    join(MOCKS, 'mock-youtube.html'),
    'utf-8',
  ),
  'https://dzen.ru/video/watch/storeMockId12345': readFileSync(
    join(MOCKS, 'mock-dzen.html'),
    'utf-8',
  ),
  'https://rutube.ru/video/storeMockId12345/': readFileSync(
    join(MOCKS, 'mock-rutube.html'),
    'utf-8',
  ),
};

mkdirSync(OUT_DIR, { recursive: true });
rmSync(RAW_DIR, { recursive: true, force: true });
mkdirSync(RAW_DIR, { recursive: true });

const userDataDir = resolve(__dirname, '.tmp-promo-profile');
rmSync(userDataDir, { recursive: true, force: true });

const ctx = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${EXT_DIR}`,
    `--load-extension=${EXT_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--lang=en-US',
  ],
  locale: 'en-US',
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  recordVideo: { dir: RAW_DIR, size: { width: 1280, height: 720 } },
});

// The extension opens welcome.html on install and takes focus. Playwright
// records ONE video per page, so that tab produces its own file — and picking
// "the first .webm in the directory" silently yielded a 19-second clip of the
// welcome page instead of the demo. Close it, and track our own page's video
// explicitly rather than by directory listing.
await new Promise((r) => setTimeout(r, 1500));
for (const p of ctx.pages()) {
  if (p.url().startsWith('chrome-extension://')) await p.close();
}

const page = await ctx.newPage();
await page.setViewportSize({ width: 1280, height: 720 });
await page.route('**/*', async (route) => {
  const url = route.request().url();
  const body = PAGES[url];
  if (body) {
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
  } else if (url.startsWith('chrome-extension://') || url.startsWith('data:')) {
    await route.continue();
  } else {
    await route.abort();
  }
});

const beat = (ms = 1200) => page.waitForTimeout(ms);

/** Land on a host, wait for the extension's own panel, settle. */
async function scene(url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('.vs-panel', { timeout: 15000 });
  // The first-run hint is right for a real new user and noise in a promo clip.
  await page.evaluate(() => document.getElementById('speed-notifications')?.remove());
  await beat(1500);
}

/** Click a speed preset by its visible label, then let the toast be read. */
async function pressSpeed(label) {
  const button = page.locator('.vs-panel button', { hasText: new RegExp(`^${label}$`) }).first();
  await button.hover();
  await beat(400);
  await button.click();
  await beat(1600);
}

// 1. YouTube — the site everyone recognises, so the clip opens on familiar ground.
await scene('https://www.youtube.com/watch?v=storeMockId12345');
await pressSpeed('1\\.5x');
await pressSpeed('2x');

// 2. The slider, for the in-between values the buttons do not cover.
const slider = page.locator('.vs-panel input[type="range"]').first();
if (await slider.count()) {
  await slider.hover();
  await beat(400);
  const box = await slider.boundingBox();
  if (box) {
    // Drag across the track rather than setting the value: the fill and the
    // tooltip following the thumb are the point of showing it at all.
    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 15; i <= 55; i += 5) {
      await page.mouse.move(box.x + box.width * (i / 100), box.y + box.height / 2);
      await page.waitForTimeout(90);
    }
    await page.mouse.up();
    await beat(1400);
  }
}

// 3. RuTube — in the name, so it belongs in the clip; also the site whose own
// player has the coarsest steps.
await scene('https://rutube.ru/video/storeMockId12345/');
await pressSpeed('1\\.75x');

// 4. Dzen — the argument no competitor has: its own player offers no speed
// control at all, so this is the whole pitch in one shot.
await scene('https://dzen.ru/video/watch/storeMockId12345');
await pressSpeed('1\\.5x');
await pressSpeed('2\\.5x');

// 5. Settings, to show it is configurable rather than a fixed row of buttons.
await page.click('.vs-gear-button');
await page
  .waitForSelector('.settings-menu.show, .settings-menu[aria-hidden="false"]', { timeout: 5000 })
  .catch(() => null);
await beat(2000);
await page.evaluate(() => {
  const body = document.querySelector('.settings-menu .vs-menu-body');
  if (body) body.scrollTop = 260;
});
await beat(2200);

const video = page.video();
await page.close();
await ctx.close();
rmSync(userDataDir, { recursive: true, force: true });

const rawPath = video ? await video.path() : null;
if (!rawPath || !existsSync(rawPath)) {
  console.error('Playwright wrote no video for the demo page — nothing to transcode.');
  process.exit(1);
}
renameSync(rawPath, join(RAW_DIR, 'raw.webm'));

execFileSync(
  'ffmpeg',
  [
    '-y',
    '-i',
    join(RAW_DIR, 'raw.webm'),
    '-vf',
    'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x0f0f0f,fps=30',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '23',
    // Required for the clip to play in Safari and in every in-feed preview.
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    OUT_MP4,
  ],
  { stdio: 'inherit' },
);

// The README embeds demo.gif, so a clip refreshed without it leaves the
// landing page showing an older product than the store does — which is exactly
// how the July GIF survived four releases. Derive one from the other in the
// same run and the two cannot drift apart.
execFileSync(
  'ffmpeg',
  [
    '-y',
    // Skip the first seconds: the page is still settling there and the panel
    // sits clipped at the bottom edge. A GIF's first frame is what a README
    // shows before it plays, so that frame has to be the finished layout.
    '-ss',
    '3',
    '-i',
    OUT_MP4,
    '-vf',
    'fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
    join(OUT_DIR, 'demo.gif'),
  ],
  { stdio: 'inherit' },
);

const probe = execFileSync('ffprobe', [
  '-v',
  'error',
  '-show_entries',
  'format=duration,size',
  '-of',
  'default=noprint_wrappers=1',
  OUT_MP4,
]).toString();
console.log(`\nwrote ${OUT_MP4}\n${probe}`);
