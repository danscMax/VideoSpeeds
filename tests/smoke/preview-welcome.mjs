/**
 * Preview the built welcome page at several viewport widths to verify
 * the v3 layout doesn't overflow or overlap. Standalone — does not need
 * the user's running Chrome; spins up its own Chromium.
 *
 * Usage: node tests/smoke/preview-welcome.mjs
 * Output: tests/smoke/audit-shots/welcome-<width>px.png
 */

import { chromium } from '@playwright/test';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');
const EXT_DIR = resolve(REPO, '.output', 'chrome-mv3');
const OUT = resolve(__dirname, 'audit-shots');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const widths = [1440, 1280, 1024, 900, 760, 600];

const ctx = await chromium.launchPersistentContext('', {
  headless: false,
  channel: 'chromium',
  args: [
    `--disable-extensions-except=${EXT_DIR}`,
    `--load-extension=${EXT_DIR}`,
    '--no-first-run',
  ],
});

// Wait for the service worker so we can read its extension ID.
let extId = null;
for (let i = 0; i < 30; i++) {
  const sw = ctx.serviceWorkers()[0];
  if (sw) {
    extId = new URL(sw.url()).host;
    break;
  }
  await new Promise(r => setTimeout(r, 200));
}
if (!extId) {
  console.error('FAIL: no service worker found');
  await ctx.close();
  process.exit(1);
}

console.log(`extension id: ${extId}`);
const url = `chrome-extension://${extId}/welcome.html`;

const page = await ctx.newPage();

// Capture both dark and light themes — welcome page reads
// prefers-color-scheme. emulateMedia lets us flip without OS-level config.
for (const theme of ['dark', 'light']) {
  await page.emulateMedia({ colorScheme: theme });
for (const w of widths) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle' });
  // Welcome renders synchronously after script load — give it a beat for
  // fonts and any animations to settle.
  await page.waitForTimeout(500);

  const file = resolve(OUT, `welcome-${theme}-${w}px.png`);
  await page.screenshot({ path: file, fullPage: true });

  // Probe for layout issues: any element whose right edge exceeds
  // the viewport, or any annotation overlapping the panel.
  const issues = await page.evaluate(() => {
    const out = [];
    const vw = window.innerWidth;
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && r.width > 0) {
        out.push({ kind: 'overflow', tag: el.tagName, cls: el.className.toString().slice(0, 80), right: Math.round(r.right) });
        if (out.length > 5) break;
      }
    }
    const panel = document.querySelector('.real-panel');
    const anns = document.querySelectorAll('.real-stage > .annotation');
    if (panel) {
      const pr = panel.getBoundingClientRect();
      for (const a of anns) {
        const ar = a.getBoundingClientRect();
        const overlapX = Math.max(0, Math.min(pr.right, ar.right) - Math.max(pr.left, ar.left));
        const overlapY = Math.max(0, Math.min(pr.bottom, ar.bottom) - Math.max(pr.top, ar.top));
        if (overlapX > 0 && overlapY > 0) {
          out.push({ kind: 'panel-collision', cls: a.className.toString().slice(0, 60), overlapW: Math.round(overlapX), overlapH: Math.round(overlapY) });
        }
      }
    }
    return out;
  });

  console.log(`${theme} ${w}px: ${file}  ${issues.length === 0 ? 'OK' : 'ISSUES: ' + JSON.stringify(issues)}`);
}
}

await ctx.close();
