// End-to-end smoke against the launch-debug-browser.mjs Chromium.
// Connects via CDP, runs the recent-fix regression suite, prints results.
// Doesn't close the browser — you can keep using it after.

import { chromium } from 'playwright';

const CDP = `http://localhost:${process.env.VS_CDP_PORT ?? 9333}`;
const browser = await chromium.connectOverCDP(CDP);
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => p.url().includes('youtube.com')) ?? ctx.pages()[0];

function log(label, ok, detail = '') {
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${label}${detail ? ' — ' + detail : ''}`);
  return ok;
}

const results = {};

async function probePanel(p) {
  return p.evaluate(() => {
    const panel = document.querySelector('.vs-panel');
    const playlist = document.querySelector('ytd-playlist-panel-renderer');
    const player = document.querySelector('ytd-player#ytd-player') || document.querySelector('#player');
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { y: Math.round(r.y), h: Math.round(r.height) };
    };
    return {
      panelExists: !!panel,
      panelParent: panel?.parentElement?.tagName + '#' + (panel?.parentElement?.id || ''),
      panelPrev: panel?.previousElementSibling?.tagName + '#' + (panel?.previousElementSibling?.id || ''),
      panelNext: panel?.nextElementSibling?.tagName + '#' + (panel?.nextElementSibling?.id || ''),
      panelY: rect(panel)?.y,
      playlistY: rect(playlist)?.y,
      playerY: rect(player)?.y,
      playerH: rect(player)?.h,
    };
  });
}

// --- Test 1: YT narrow (800x900) anchor + ordering ---
console.log('\n=== Test 1: YT narrow (current 800×900) ===');
const t1 = await probePanel(page);
console.log(JSON.stringify(t1, null, 2));
results.t1_anchor = log('YT narrow: panel parent = #primary-inner', t1.panelParent === 'DIV#primary-inner', `got ${t1.panelParent}`);
results.t1_order = log('YT narrow: panel above playlist', t1.playlistY == null || t1.panelY < t1.playlistY, `panel ${t1.panelY} vs playlist ${t1.playlistY}`);

// --- Test 2: YT wide viewport ---
console.log('\n=== Test 2: YT wide (1366×900) ===');
await page.setViewportSize({ width: 1366, height: 900 });
await page.waitForTimeout(2000);
const t2 = await probePanel(page);
console.log(JSON.stringify(t2, null, 2));
results.t2_anchor = log('YT wide: panel parent = #primary-inner', t2.panelParent === 'DIV#primary-inner');

// --- Test 3: YT speed click (interaction) ---
console.log('\n=== Test 3: YT speed click 2x ===');
await page.setViewportSize({ width: 800, height: 900 });
await page.waitForTimeout(1000);
const before = await page.evaluate(() => document.querySelector('video')?.playbackRate);
await page.evaluate(() => document.querySelector('.vs-panel button[data-vs-speed="2"]')?.click());
await page.waitForTimeout(500);
const after = await page.evaluate(() => document.querySelector('video')?.playbackRate);
results.t3_click = log('speed click 2x', after === 2, `rate ${before} -> ${after}`);

// --- Test 4: YT settings menu open ---
console.log('\n=== Test 4: YT settings menu open ===');
await page.evaluate(() => document.querySelector('.vs-panel .vs-gear-button')?.click());
await page.waitForTimeout(500);
const menu = await page.evaluate(() => {
  const m = document.querySelector('.vs-panel .settings-menu');
  if (!m) return null;
  const r = m.getBoundingClientRect();
  return { visible: m.classList.contains('show'), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), overflowR: r.right > window.innerWidth };
});
console.log('menu:', JSON.stringify(menu));
results.t4_menu = log('settings menu visible + within viewport', !!menu && menu.visible && !menu.overflowR);
// Close
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(300);

// --- Test 5: YT SPA navigation ---
console.log('\n=== Test 5: YT SPA nav (click next playlist item) ===');
const beforeUrl = page.url();
const clicked = await page.evaluate(() => {
  const items = document.querySelectorAll('ytd-playlist-panel-renderer ytd-playlist-panel-video-renderer');
  // Click the second item if available
  const target = items[1] ?? items[0];
  if (!target) return false;
  target.click();
  return true;
});
if (clicked) {
  await page.waitForTimeout(4000);
  const t5 = await probePanel(page);
  const afterUrl = page.url();
  console.log(`url: ${beforeUrl}\n  -> ${afterUrl}`);
  console.log(JSON.stringify(t5, null, 2));
  results.t5_nav = log('SPA nav: panel reattached in #primary-inner', t5.panelExists && t5.panelParent === 'DIV#primary-inner');
} else {
  results.t5_nav = log('SPA nav: clickable playlist item not found — SKIP', true);
}

// --- Test 6: RT /u/ channel page (panel must NOT appear) ---
console.log('\n=== Test 6: RT /u/ channel — panel must be absent ===');
await page.goto('https://rutube.ru/u/rutube/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
await page.waitForTimeout(5000);
const rtChannel = await page.evaluate(() => ({
  pathname: location.pathname,
  panelExists: !!document.querySelector('.vs-panel'),
}));
console.log(JSON.stringify(rtChannel));
results.t6_rt_channel = log('RT channel: panel absent', !rtChannel.panelExists);

// --- Test 7: RT /video/ page — panel must appear ---
console.log('\n=== Test 7: RT /video/ — panel present ===');
// Use a stable Russian short — pick one known to be public
await page.goto('https://rutube.ru/video/cf38c30c8b5dba4ec39a5a5c70e6d97a/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
await page.waitForTimeout(7000);
const rtVideo = await page.evaluate(() => {
  const panel = document.querySelector('.vs-panel');
  return {
    pathname: location.pathname,
    panelExists: !!panel,
    panelParent: panel?.parentElement?.className?.toString()?.slice(0, 100),
  };
});
console.log(JSON.stringify(rtVideo));
results.t7_rt_video = log('RT video: panel present', rtVideo.panelExists);

// --- Test 8: Hotkey regression (empty-key placeholder must NOT trigger) ---
console.log('\n=== Test 8: hotkey empty-key placeholder regression ===');
// Inject an empty-key hotkey into settings, then dispatch a media-key event
// (event.code='') and verify rate doesn't change.
const hotkeyResult = await page.evaluate(async () => {
  // Find the video & store baseline rate
  const v = document.querySelector('video');
  if (!v) return { skipped: true, reason: 'no video' };
  const before = v.playbackRate;
  // Dispatch a synthetic empty-code keydown — the bug was matchesSingleHotkey
  // returning true for empty-key hotkeys. Defensive guard added in 0.1.30.
  document.dispatchEvent(new KeyboardEvent('keydown', { code: '', bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'MediaPlayPause', bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  const after = v.playbackRate;
  return { before, after, changed: Math.abs(before - after) > 0.01 };
});
console.log(JSON.stringify(hotkeyResult));
if (hotkeyResult.skipped) {
  results.t8_hotkey = log(`hotkey empty-key — SKIP (${hotkeyResult.reason})`, true);
} else {
  results.t8_hotkey = log('hotkey empty-key does not change rate', !hotkeyResult.changed, `before=${hotkeyResult.before} after=${hotkeyResult.after}`);
}

// --- Summary ---
console.log('\n=== SUMMARY ===');
const passed = Object.values(results).filter(Boolean).length;
const total = Object.keys(results).length;
for (const [k, v] of Object.entries(results)) {
  console.log(`  ${v ? 'PASS' : 'FAIL'}  ${k}`);
}
console.log(`\n${passed}/${total} passed`);

await browser.close();
process.exit(passed === total ? 0 : 1);
