// Attach to the Chromium launched by launch-debug-browser.mjs (CDP at
// http://localhost:9333 by default) and run a panel-anchor probe on the
// current YouTube page. Doesn't navigate, doesn't close — purely inspects
// the live state.

import { chromium } from 'playwright';

const CDP_PORT = Number(process.env.VS_CDP_PORT ?? 9333);
const URL = `http://localhost:${CDP_PORT}`;
console.log(`connecting to ${URL}...`);

const browser = await chromium.connectOverCDP(URL);
console.log(`connected; ${browser.contexts().length} context(s)`);

const ctx = browser.contexts()[0];
if (!ctx) {
  console.error('no contexts found');
  process.exit(1);
}

const page = ctx.pages().find((p) => p.url().includes('youtube.com'))
  ?? ctx.pages()[0];
if (!page) {
  console.error('no page found');
  process.exit(1);
}
console.log(`page url: ${page.url()}`);
console.log(`viewport: ${JSON.stringify(page.viewportSize())}`);

const probe = await page.evaluate(() => {
  const panel = document.querySelector('.vs-panel');
  const below = document.querySelector('#primary-inner > #below');
  const meta = document.querySelector('ytd-watch-metadata');
  const playlist = document.querySelector('ytd-playlist-panel-renderer');
  const player = document.querySelector('ytd-player#ytd-player');

  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };

  return {
    width: window.innerWidth,
    height: window.innerHeight,
    panel: {
      exists: !!panel,
      parent: panel?.parentElement?.tagName + '#' + (panel?.parentElement?.id || ''),
      prev: panel?.previousElementSibling?.tagName + '#' + (panel?.previousElementSibling?.id || ''),
      next: panel?.nextElementSibling?.tagName + '#' + (panel?.nextElementSibling?.id || ''),
      rect: rect(panel),
    },
    below: { exists: !!below, rect: rect(below) },
    metaParent: meta?.parentElement?.tagName + '#' + (meta?.parentElement?.id || ''),
    playlist: {
      exists: !!playlist,
      parent: playlist?.parentElement?.tagName + '#' + (playlist?.parentElement?.id || ''),
      rect: rect(playlist),
    },
    player: { rect: rect(player) },
  };
});

console.log('probe:');
console.log(JSON.stringify(probe, null, 2));

const expectedParent = 'DIV#primary-inner';
const parentOk = probe.panel.parent === expectedParent;
const orderOk =
  probe.playlist.rect == null ||
  probe.panel.rect == null ||
  probe.panel.rect.y < probe.playlist.rect.y;

console.log(`\nparent check: ${parentOk ? 'PASS' : 'FAIL'} (expected ${expectedParent}, got ${probe.panel.parent})`);
console.log(`order check:  ${orderOk ? 'PASS' : 'FAIL'} (panel y=${probe.panel.rect?.y}, playlist y=${probe.playlist.rect?.y})`);

await browser.close(); // disconnects CDP, doesn't close the browser
process.exit(parentOk && orderOk ? 0 : 1);
