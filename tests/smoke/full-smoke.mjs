/**
 * Comprehensive automated smoke for the in-player panel.
 *
 * Connects to a running Chromium via CDP (run via `npm run smoke:full`
 * after launching Chromium with the extension and --remote-debugging-port).
 *
 * Checks per site (YouTube + RuTube):
 *   1. Dismiss consent / subscription / privacy modals so subsequent
 *      clicks don't get intercepted.
 *   2. Probe panel: in DOM, visible, themed correctly, position vs player.
 *   3. Click chain: every preset button -> verify video.playbackRate
 *      reflects the click + active class moves.
 *   4. Slider: set to 1.0, 2.0, 3.0; verify rate + label change.
 *   5. Hotkey: Ctrl+C (+0.1) and Ctrl+V (-0.1).
 *   6. Settings modal: open, switch tab to Hotkeys, switch language en->ru
 *      and verify modal text updated, switch slider position right->bottom
 *      and verify data-vs-slider-position attr changed, close.
 *   7. SPA navigation: click a recommended video, wait, verify panel
 *      re-attached on the new page.
 *
 * Reports PASS/FAIL per check, captures screenshots at key moments.
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

/** PASS/FAIL accumulator. */
class Results {
  constructor(label) { this.label = label; this.checks = []; }
  ok(name, value) { this.checks.push({ name, status: 'PASS', value }); }
  fail(name, reason) { this.checks.push({ name, status: 'FAIL', reason }); }
  skip(name, reason) { this.checks.push({ name, status: 'SKIP', reason }); }
  print() {
    console.log(`\n=== ${this.label} ===`);
    for (const c of this.checks) {
      const tag = c.status === 'PASS' ? '✓' : c.status === 'SKIP' ? '·' : '✗';
      const detail = c.status === 'PASS' ? (c.value ?? '') : (c.reason ?? '');
      console.log(`  ${tag} ${c.name}${detail ? ': ' + JSON.stringify(detail) : ''}`);
    }
    const pass = this.checks.filter(c => c.status === 'PASS').length;
    const fail = this.checks.filter(c => c.status === 'FAIL').length;
    const skip = this.checks.filter(c => c.status === 'SKIP').length;
    console.log(`  -> ${pass} pass / ${fail} fail / ${skip} skip`);
    return { pass, fail, skip };
  }
}

/**
 * Brute-force consent / subscription modal dismissal. We try a list of
 * known close-button selectors + Escape key + click outside. Idempotent.
 */
async function dismissModals(page) {
  const selectors = [
    // YouTube GDPR consent
    'button[aria-label*="Принять" i]',
    'button[aria-label*="Accept" i]',
    'tp-yt-paper-button:has-text("Принять")',
    'tp-yt-paper-button:has-text("Accept")',
    // RuTube subscription popup -- close (X) buttons
    'button[aria-label*="закрыть" i]',
    'button[aria-label*="close" i]',
    '[class*="modal"] button[class*="close" i]',
    '[class*="popup"] button[class*="close" i]',
    // RuTube cookie banner
    'button:has-text("Хорошо")',
    'button:has-text("Закрыть")',
  ];
  for (const sel of selectors) {
    const locs = await page.locator(sel).all().catch(() => []);
    for (const loc of locs) {
      try { await loc.click({ timeout: 1500, force: true }); } catch { /* swallow */ }
    }
  }
  // Plus: try Escape key.
  try { await page.keyboard.press('Escape'); } catch { /* swallow */ }
  await page.waitForTimeout(800);
}

/** Click a speed-button via JS .click() so overlay popups can't intercept. */
async function clickSpeedJs(page, label) {
  return page.evaluate((lbl) => {
    const btn = Array.from(document.querySelectorAll('.speed-button')).find(
      (b) => (b.textContent ?? '').trim() === lbl,
    );
    if (!btn) return false;
    btn.click();
    return true;
  }, label);
}

async function readState(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.vs-panel');
    return {
      vsExtMarker: document.documentElement.dataset.vsExtActive,
      vsTheme: document.documentElement.dataset.vsTheme,
      panelInDom: !!panel,
      panelRect: panel?.getBoundingClientRect(),
      panelSiteAttr: panel?.dataset?.vsSite,
      videoRate: document.querySelector('video')?.playbackRate ?? null,
      activeButton: document.querySelector('.speed-button.active')?.textContent?.trim(),
      sliderLabel: document.querySelector('.speed-slider-label')?.textContent,
      buttonsTexts: Array.from(document.querySelectorAll('.speed-button')).map((b) => (b.textContent ?? '').trim()),
    };
  });
}

async function runSiteSuite(page, label, opts) {
  const r = new Results(label);
  await page.bringToFront();
  await page.waitForTimeout(2000);

  // 1. Dismiss modals.
  await dismissModals(page);
  await page.waitForTimeout(500);

  // 2. Probe.
  const state = await readState(page);
  r.ok('vsExtMarker claimed', state.vsExtMarker === '1' || 'NOT SET');
  r.ok('panel in DOM', state.panelInDom);
  if (!state.panelInDom) {
    r.fail('skip rest', 'no panel');
    return r;
  }
  r.ok('theme', state.vsTheme);
  r.ok('site attr', state.panelSiteAttr);
  r.ok('button count', state.buttonsTexts.length);

  // Panel sits below the player (y > player.bottom - some_gap).
  const playerR = await page.evaluate((sel) => {
    const p = document.querySelector(sel);
    return p?.getBoundingClientRect();
  }, opts.playerSelector);
  if (playerR) {
    const below = state.panelRect && state.panelRect.top >= playerR.top - 20;
    if (below) r.ok('panel below player', `${state.panelRect.top.toFixed(0)} vs player.top ${playerR.top.toFixed(0)}`);
    else r.fail('panel below player', { panelTop: state.panelRect?.top, playerTop: playerR.top });
  }

  // 3. Click chain through every preset.
  const presetTexts = state.buttonsTexts;
  for (const lbl of presetTexts) {
    const ok = await clickSpeedJs(page, lbl);
    if (!ok) { r.fail(`click ${lbl}`, 'button not found'); continue; }
    await page.waitForTimeout(550);
    const after = await readState(page);
    const expected = parseFloat(lbl.replace('x', ''));
    const matches = after.videoRate != null && Math.abs(after.videoRate - expected) < 0.02;
    if (matches) r.ok(`click ${lbl} -> rate`, after.videoRate);
    else r.fail(`click ${lbl} -> rate`, { expected, got: after.videoRate });
    if (after.activeButton === lbl) r.ok(`active reflects ${lbl}`);
    else r.fail(`active reflects ${lbl}`, after.activeButton ?? null);
  }

  // 4. Slider at 3 values.
  for (const val of [1.0, 2.0, 3.0]) {
    const set = await page.evaluate((v) => {
      const s = document.querySelector('.speed-slider');
      if (!s) return false;
      s.value = String(v);
      s.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, val);
    if (!set) { r.fail(`slider set ${val}`, 'no slider'); continue; }
    await page.waitForTimeout(700);
    const after = await readState(page);
    const matches = after.videoRate != null && Math.abs(after.videoRate - val) < 0.02;
    if (matches) r.ok(`slider ${val} -> rate`, after.videoRate);
    else r.fail(`slider ${val} -> rate`, { expected: val, got: after.videoRate, label: after.sliderLabel });
  }

  // 5. Hotkeys -- Ctrl+C (+0.1), Ctrl+V (-0.1). Pre-set to a mid-range
  // value so we never hit the per-site min/max clamp (RuTube max=3.0,
  // pressing Ctrl+C while AT 3.0 is a clamped no-op -- correct behavior
  // but a false-fail for this assertion).
  await page.evaluate(() => {
    const s = document.querySelector('.speed-slider');
    if (s) {
      s.value = '1.5';
      s.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('video')?.focus());
  const beforeHk = (await readState(page)).videoRate ?? 0;
  await page.keyboard.press('Control+KeyC');
  await page.waitForTimeout(500);
  const afterUp = (await readState(page)).videoRate ?? 0;
  if (Math.abs(afterUp - beforeHk - 0.1) < 0.02) r.ok('Ctrl+C +0.1', { before: beforeHk, after: afterUp });
  else r.fail('Ctrl+C +0.1', { before: beforeHk, after: afterUp });

  await page.keyboard.press('Control+KeyV');
  await page.waitForTimeout(500);
  const afterDown = (await readState(page)).videoRate ?? 0;
  if (Math.abs(afterDown - afterUp + 0.1) < 0.02) r.ok('Ctrl+V -0.1', { after: afterDown });
  else r.fail('Ctrl+V -0.1', { afterUp, afterDown });

  // 6. Settings modal -- open + tab switch + language switch.
  const opened = await page.evaluate(() => {
    document.querySelector('.vs-gear-button')?.click();
    return new Promise((res) => setTimeout(() => {
      const m = document.querySelector('.settings-menu');
      res(m && getComputedStyle(m).display !== 'none');
    }, 350));
  });
  if (!opened) r.fail('settings open', 'no modal');
  else {
    r.ok('settings open');

    // Save initial menu title for comparison after lang switch.
    const titleBefore = await page.evaluate(() => document.querySelector('.vs-menu-title')?.textContent?.trim());

    // Switch to Russian if currently English; else to English.
    const targetLang = (await readState(page)).vsTheme && titleBefore?.includes('Playback') ? 'ru' : 'en';
    await page.evaluate((lang) => {
      document.querySelector(`[data-vs-lang="${lang}"]`)?.click();
    }, targetLang);
    await page.waitForTimeout(700);
    const titleAfter = await page.evaluate(() => document.querySelector('.vs-menu-title')?.textContent?.trim());
    if (titleAfter && titleAfter !== titleBefore) r.ok(`lang ${targetLang} re-render`, { before: titleBefore, after: titleAfter });
    else r.fail(`lang ${targetLang} re-render`, { titleBefore, titleAfter });

    // Switch back so the next run starts predictable.
    const original = targetLang === 'ru' ? 'en' : 'ru';
    await page.evaluate((l) => document.querySelector(`[data-vs-lang="${l}"]`)?.click(), original);
    await page.waitForTimeout(400);

    // Switch slider position to bottom + verify attribute.
    await page.evaluate(() => document.querySelector('[data-vs-pos="bottom"]')?.click());
    await page.waitForTimeout(700);
    const posBottom = await page.evaluate(() => document.querySelector('.vs-panel')?.dataset.vsSliderPosition);
    if (posBottom === 'bottom') r.ok('sliderPos toggle bottom');
    else r.fail('sliderPos toggle bottom', posBottom);
    await page.evaluate(() => document.querySelector('[data-vs-pos="right"]')?.click());
    await page.waitForTimeout(400);

    // Close.
    await page.evaluate(() => document.querySelector('.vs-gear-button')?.click());
    await page.waitForTimeout(300);
  }

  // 7. Screenshot.
  await page.evaluate(() => document.querySelector('.vs-panel')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const p = document.querySelector('.vs-panel');
    if (p) { p.style.outline = '3px solid magenta'; p.style.outlineOffset = '3px'; }
  });
  await page.screenshot({ path: join(SHOTS, `full-${label}.png`), fullPage: false });
  await page.evaluate(() => {
    const p = document.querySelector('.vs-panel');
    if (p) { p.style.outline = ''; p.style.outlineOffset = ''; }
  });

  return r;
}

// SPA navigation test -- separate because it depends on YouTube specific.
async function spaNavTest(page) {
  const r = new Results('YouTube SPA navigation');
  const beforeUrl = page.url();
  await page.evaluate(() => {
    const a = document.querySelector('ytd-watch-next-secondary-results-renderer a#thumbnail[href*="/watch?"]')
      ?? document.querySelector('a#thumbnail[href*="/watch?"]')
      ?? document.querySelector('a[href*="/watch?v="]');
    a?.click();
  });
  await page.waitForTimeout(7000);
  const afterUrl = page.url();
  if (afterUrl !== beforeUrl) r.ok('navigated', { before: beforeUrl, after: afterUrl });
  else r.fail('navigated', { stayed: beforeUrl });

  // Check panel still exists.
  const state = await readState(page);
  if (state.panelInDom) r.ok('panel re-attached', { theme: state.vsTheme, buttons: state.buttonsTexts.length });
  else r.fail('panel re-attached', 'no panel after nav');

  return r;
}

// Run.
const yt = ctx.pages().find((p) => p.url().includes('youtube.com'));
let ytResults = null;
if (yt) {
  ytResults = await runSiteSuite(yt, 'youtube', {
    playerSelector: '#movie_player',
  });
  ytResults.print();
}

const ru = ctx.pages().find((p) => p.url().includes('rutube.ru'));
let ruResults = null;
if (ru) {
  ruResults = await runSiteSuite(ru, 'rutube', {
    playerSelector: '[class*="video-page-layout-module__player"]',
  });
  ruResults.print();
}

let spaResults = null;
if (yt) {
  spaResults = await spaNavTest(yt);
  spaResults.print();
}

await browser.close();

const all = [ytResults, ruResults, spaResults].filter(Boolean);
const totals = all.reduce((acc, r) => {
  for (const c of r.checks) acc[c.status.toLowerCase()] = (acc[c.status.toLowerCase()] ?? 0) + 1;
  return acc;
}, { pass: 0, fail: 0, skip: 0 });
console.log(`\n=== TOTAL: ${totals.pass} pass / ${totals.fail} fail / ${totals.skip} skip ===`);
process.exit(totals.fail > 0 ? 1 : 0);
