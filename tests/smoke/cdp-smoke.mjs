/**
 * Local smoke runner -- attaches to a running Chromium via CDP and probes
 * the extension's DOM/state on YouTube and RuTube.
 *
 * Why this exists alongside `tests/smoke/extension-loads.spec.ts`:
 *   - The Playwright test runner (`npm run test:smoke`) launches a fresh
 *     Chromium via `chromium.launchPersistentContext`. On at least one
 *     local Windows config that path crashes Node with
 *     STATUS_STACK_BUFFER_OVERRUN before any test code runs. CI on Linux
 *     is unaffected; this script is the local fallback.
 *   - Connecting to an already-running Chromium via CDP avoids the launch
 *     code path entirely.
 *
 * Usage (Windows):
 *   1. Build:     npx wxt build
 *   2. Copy:      robocopy ".output\chrome-mv3" "C:\Temp\videospeeds-build" /E
 *      (or use any ASCII path -- Chrome's --load-extension= rejects
 *      Cyrillic on Windows; see docs/CAVEATS.md)
 *   3. Launch Chromium with the extension + remote debugging port:
 *      $chrome = "C:\Users\<you>\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe"
 *      Start-Process $chrome -ArgumentList @(
 *        "--user-data-dir=C:\Temp\videospeeds-profile",
 *        "--disable-extensions-except=C:\Temp\videospeeds-build",
 *        "--load-extension=C:\Temp\videospeeds-build",
 *        "--no-first-run",
 *        "--remote-debugging-port=9333",
 *        "https://www.youtube.com/watch?v=jNQXAC9IVRw"
 *      )
 *   4. node tests/smoke/cdp-smoke.mjs
 */

import { chromium } from '@playwright/test';

const CDP = process.env.VS_SMOKE_CDP ?? 'http://127.0.0.1:9333';
const RUTUBE_URL = process.env.VS_SMOKE_RUTUBE ?? 'https://rutube.ru/';

const browser = await chromium.connectOverCDP(CDP);
const ctx = browser.contexts()[0];

const results = { youtube: null, rutube: null, errors: [] };

/** Probe an open page. Verifies bootstrap injected its DOM markers + UI. */
async function probePage(page, label) {
  const probe = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('.speed-button'));
    return {
      url: location.href,
      hostname: location.hostname,
      vsExtMarker: document.documentElement.dataset.vsExtActive ?? null,
      vsTmMarker: document.documentElement.dataset.vsTmActive ?? null,
      panelCount: document.querySelectorAll('.vs-panel').length,
      speedButtonsCount: buttons.length,
      speedButtonsTexts: buttons.map((b) => (b.textContent ?? '').trim()),
      activeButton: document.querySelector('.speed-button.active')?.textContent?.trim() ?? null,
      sliderCount: document.querySelectorAll('.speed-slider').length,
      sliderLabel: document.querySelector('.speed-slider-label')?.textContent ?? null,
      gearCount: document.querySelectorAll('.vs-gear-button').length,
      settingsMenuPresent: document.querySelector('.settings-menu') !== null,
      stylesInjected: document.getElementById('vs-styles') !== null,
      pageWorldFlag: typeof (window).__VS_PAGE_WORLD,
      historyHookFlag: !!(window).__vs_historyHookInstalled,
      videoCount: document.querySelectorAll('video').length,
      videoRate: document.querySelector('video')?.playbackRate ?? null,
      videoReady: document.querySelector('video')?.readyState ?? null,
    };
  });

  // Try toggling the settings menu via gear-button click.
  const modalToggle = await page.evaluate(() => {
    const gear = document.querySelector('.vs-gear-button');
    if (!gear) return 'no-gear';
    gear.click();
    return new Promise((resolve) => setTimeout(() => {
      const isOpen = document.querySelector('.settings-menu')?.style.display !== 'none';
      resolve(isOpen ? 'opened' : 'closed-after-click');
    }, 200));
  });

  return { label, probe, modalToggle };
}

// 1. YouTube tab (must already be open, see usage docs above).
const yt = ctx.pages().find((p) => p.url().includes('youtube.com'));
if (yt) {
  console.log('=== YouTube ===');
  results.youtube = await probePage(yt, 'youtube');
  console.log(JSON.stringify(results.youtube, null, 2));
} else {
  console.log('No YouTube tab open; skipping');
}

// 2. RuTube -- open a fresh tab.
console.log('\n=== RuTube ===');
const ruPage = await ctx.newPage();
const ruErrors = [];
const ruInitLogs = [];
ruPage.on('console', (m) => {
  if (m.text().includes('[VIDEO-SPEEDS]')) ruInitLogs.push(`${m.type()}: ${m.text()}`);
});
ruPage.on('pageerror', (e) => ruErrors.push(`pageerror: ${e.message}`));
try {
  await ruPage.goto(RUTUBE_URL, { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await ruPage.waitForTimeout(7_000);
  results.rutube = await probePage(ruPage, 'rutube');
  results.rutube.initLogs = ruInitLogs.slice(0, 5);
  results.rutube.consoleErrors = ruErrors;
  console.log(JSON.stringify(results.rutube, null, 2));
} catch (e) {
  results.errors.push(`RuTube nav failed: ${e.message}`);
  console.log('RuTube failed:', e.message);
}

await browser.close();

// Verdict
const okYt = !results.youtube || (results.youtube.probe.vsExtMarker === '1' &&
  results.youtube.probe.panelCount > 0 && results.youtube.probe.speedButtonsCount > 0);
const okRu = !results.rutube || (results.rutube.probe.vsExtMarker === '1' &&
  results.rutube.probe.panelCount > 0 && results.rutube.probe.speedButtonsCount > 0 &&
  results.rutube.probe.historyHookFlag === true);
const verdict = okYt && okRu;

console.log('\n=== VERDICT ===');
console.log(verdict ? 'smoke PASSED' : 'smoke FAILED');
console.log(JSON.stringify({ okYouTube: okYt, okRuTube: okRu, errors: results.errors }, null, 2));
process.exit(verdict ? 0 : 1);
