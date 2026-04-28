// Launch Playwright Firefox with the .output/firefox-mv3 extension preloaded.
// Stays open until the window is closed or the process is killed. Companion
// of `launch-debug-browser.mjs` (Chromium) — same shape, but Firefox needs
// the extension placed in <profile>/extensions/<gecko-id>/ before launch
// (no `--load-extension` equivalent on Firefox).
//
// Refs:
//   - Playwright launchPersistentContext + Firefox prefs:
//     https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context
//   - Firefox sideload prefs (about:config equivalents):
//     - xpinstall.signatures.required = false  (allow unsigned dev extension)
//     - extensions.autoDisableScopes  = 0      (don't auto-disable on start)
//     - extensions.enabledScopes      = 5      (1 profile | 4 temporary)

import { firefox } from 'playwright';
import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  cpSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EXT_DIR = process.env.VS_EXT_DIR;
if (!EXT_DIR || !existsSync(EXT_DIR)) {
  console.error(`VS_EXT_DIR missing or invalid: ${EXT_DIR}`);
  process.exit(1);
}
// Read the gecko id straight from the manifest so this script keeps working
// if we rename. wxt.config.ts pins it to 'video-speeds@maxscorpy' but
// reading it stays honest.
const manifestPath = join(EXT_DIR, 'manifest.json');
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : {};
const geckoId =
  manifest?.browser_specific_settings?.gecko?.id ?? 'video-speeds@maxscorpy';

const URL =
  process.env.VS_URL ??
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1';
const W = Number(process.env.VS_W ?? 800);
const H = Number(process.env.VS_H ?? 900);

const profileDir = mkdtempSync(join(tmpdir(), 'vs-fx-profile-'));
const extDest = join(profileDir, 'extensions', geckoId);
mkdirSync(extDest, { recursive: true });
// Source path comes pre-copied to ASCII (Node cpSync hangs on Cyrillic
// paths under Node 24 / Windows).
cpSync(EXT_DIR, extDest, { recursive: true });

console.log(`profile dir: ${profileDir}`);
console.log(`extension:   ${EXT_DIR} -> ${extDest}`);
console.log(`gecko id:    ${geckoId}`);
console.log(`URL:         ${URL}`);
console.log(`viewport:    ${W}x${H}`);

const ctx = await firefox.launchPersistentContext(profileDir, {
  headless: false,
  viewport: { width: W, height: H },
  firefoxUserPrefs: {
    'xpinstall.signatures.required': false,
    'extensions.autoDisableScopes': 0,
    'extensions.enabledScopes': 5,
    'browser.shell.checkDefaultBrowser': false,
    'browser.startup.homepage_override.mstone': 'ignore',
  },
});

const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.setViewportSize({ width: W, height: H });
page.on('console', (msg) => {
  const t = msg.text();
  if (
    t.includes('VIDEO-SPEEDS') ||
    t.includes('panel inserted') ||
    t.includes('tentative')
  ) {
    console.log(`[page] ${msg.type()}: ${t}`);
  }
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
console.log('navigated; running probe...');

// Probe panel state. Firefox doesn't expose CDP, so we cannot attach from
// another process via connectOverCDP — instead we do the probe in-line and
// log it. The user can also visually inspect the open browser window.
await page.waitForTimeout(8000);
const probe = await page.evaluate(() => {
  const panel = document.querySelector('.vs-panel');
  const playlist = document.querySelector('ytd-playlist-panel-renderer');
  const player = document.querySelector('#player');
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { y: Math.round(r.y), h: Math.round(r.height) };
  };
  return {
    width: window.innerWidth,
    panelExists: !!panel,
    panelParent:
      panel?.parentElement?.tagName + '#' + (panel?.parentElement?.id || ''),
    panelPrev:
      panel?.previousElementSibling?.tagName +
      '#' +
      (panel?.previousElementSibling?.id || ''),
    panelY: rect(panel)?.y,
    playlistY: rect(playlist)?.y,
    playerY: rect(player)?.y,
    extensionsList:
      typeof browser !== 'undefined' && browser.management?.getAll
        ? '(can introspect)'
        : '(no browser API in page)',
  };
});
console.log('probe:', JSON.stringify(probe, null, 2));

const expectedParent = 'DIV#primary-inner';
const parentOk = probe.panelParent === expectedParent;
const orderOk =
  probe.playlistY == null ||
  probe.panelY == null ||
  probe.panelY < probe.playlistY;

console.log(
  `parent: ${parentOk ? 'PASS' : 'FAIL'} (expected ${expectedParent}, got ${probe.panelParent})`,
);
console.log(
  `order:  ${orderOk ? 'PASS' : 'FAIL'} (panel y=${probe.panelY}, playlist y=${probe.playlistY})`,
);

console.log('Firefox stays open. Close the window or Ctrl+C to exit.');

ctx.on('close', () => {
  console.log('context closed; exiting');
  process.exit(0);
});

await new Promise(() => {});
