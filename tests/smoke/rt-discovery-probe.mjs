// Inspect what discovery resolves on RuTube + where panel insertion
// actually landed. Goal: understand why panel ended up in pageHeaderRow
// instead of as sibling of the player layout-section.
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9333');
const ctx = browser.contexts()[0];
let rt = null;
for (const p of ctx.pages()) if (p.url().includes('rutube.ru')) { rt = p; break; }
if (!rt) { console.error('no RT'); process.exit(1); }

await rt.bringToFront();
const probe = await rt.evaluate(() => {
  function info(el) {
    if (!el) return null;
    const cls = (el.className || '').toString().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
    return {
      tag: el.tagName.toLowerCase(),
      cls: cls ? '.' + cls : '',
      parentTag: el.parentElement?.tagName.toLowerCase(),
      parentCls: ((el.parentElement?.className || '').toString().split(/\s+/).filter(Boolean).slice(0, 2).join('.')) || '(no class)',
    };
  }

  // Probe selectors directly
  const playerExact1 = document.querySelector('[class*="video-page-layout-module__player"]');
  const playerExact2 = document.querySelector('section.video-player');
  const infoExact1 = document.querySelector('[class*="videoTitleSection"]');
  const infoExact2 = document.querySelector('[class*="pageInfoContainerWrapper"]');
  const infoExact3 = document.querySelector('h1');
  const panel = document.querySelector('.vs-panel');

  return {
    panel: info(panel),
    panelChain: panel ? [
      info(panel.parentElement),
      info(panel.parentElement?.parentElement),
      info(panel.parentElement?.parentElement?.parentElement),
    ] : null,
    playerExact1_videoPageLayoutModule: info(playerExact1),
    playerExact2_videoPlayer: info(playerExact2),
    infoExact1_videoTitleSection: info(infoExact1),
    infoExact2_pageInfoContainerWrapper: info(infoExact2),
    infoExact3_h1: info(infoExact3),
    pageHeaderRow_exists: !!document.querySelector('[class*="pageHeaderRow"]'),
    pageInfoContainer_exists: !!document.querySelector('[class*="pageInfoContainer"]:not([class*="pageInfoContainerWrapper"])'),
  };
});

console.log(JSON.stringify(probe, null, 2));
await browser.close();
