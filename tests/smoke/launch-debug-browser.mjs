// Launch a Chromium instance with the .output/chrome-mv3 extension loaded
// and a CDP endpoint exposed at http://localhost:9333. Stays open until the
// user closes the browser window or kills this process. Use the companion
// `probe-debug-browser.mjs` (or any chromium.connectOverCDP call) to attach
// later and inspect the page without restarting the browser.
//
// Why launchPersistentContext + headless:false:
//   Chrome MV3 extensions only load with a persistent profile and a
//   visible browser window. Headless mode silently drops `--load-extension`
//   (Playwright docs: https://playwright.dev/docs/chrome-extensions ).
//
// Why we read VS_EXT_DIR from env:
//   Node's `cpSync` hangs when the source path contains Cyrillic characters
//   (Node 24 / Windows). Wrapper Bash pre-copies the build into an ASCII
//   path and exports VS_EXT_DIR.

import { chromium } from 'playwright';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CDP_PORT = Number(process.env.VS_CDP_PORT ?? 9333);
const EXT_DIR = process.env.VS_EXT_DIR;
if (!EXT_DIR || !existsSync(EXT_DIR)) {
  console.error(`VS_EXT_DIR missing or invalid: ${EXT_DIR}`);
  process.exit(1);
}

const URL =
  process.env.VS_URL ??
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1';
const W = Number(process.env.VS_W ?? 800);
const H = Number(process.env.VS_H ?? 900);

const profileDir = mkdtempSync(join(tmpdir(), 'vs-debug-profile-'));
console.log(`profile dir: ${profileDir}`);
console.log(`extension:   ${EXT_DIR}`);
console.log(`CDP:         http://localhost:${CDP_PORT}`);
console.log(`URL:         ${URL}`);
console.log(`viewport:    ${W}x${H}`);

const ctx = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  viewport: { width: W, height: H },
  args: [
    `--disable-extensions-except=${EXT_DIR}`,
    `--load-extension=${EXT_DIR}`,
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
  ],
});

const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.setViewportSize({ width: W, height: H });
page.on('console', (msg) => {
  const t = msg.text();
  if (t.includes('VIDEO-SPEEDS') || t.includes('panel inserted') || t.includes('tentative')) {
    console.log(`[page] ${msg.type()}: ${t}`);
  }
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
console.log('navigated; browser stays open. Close the window or Ctrl+C to exit.');

// Exit when the user closes the last page (or browser).
ctx.on('close', () => {
  console.log('context closed; exiting');
  process.exit(0);
});

// Block forever
await new Promise(() => {});
