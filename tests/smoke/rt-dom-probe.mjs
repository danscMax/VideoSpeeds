// Probe RuTube DOM to understand panel insertion target.
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9333');
const ctx = browser.contexts()[0];
let rt = null;
for (const p of ctx.pages()) if (p.url().includes('rutube.ru')) { rt = p; break; }
if (!rt) { console.error('no RT'); process.exit(1); }

await rt.bringToFront();
await new Promise(r => setTimeout(r, 1500));

const probe = await rt.evaluate(() => {
  function describe(el) {
    if (!el) return null;
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls = (el.className || '').toString().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
    const r = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    return {
      tag,
      id,
      cls: cls ? '.' + cls : '',
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      display: cs.display,
      flexDirection: cs.flexDirection,
      flexWrap: cs.flexWrap,
    };
  }

  // Find panel
  const panel = document.querySelector('.vs-panel');
  // Find player container (try common RT selectors)
  const player =
    document.querySelector('section.video-player') ||
    document.querySelector('[class*="video-page-layout-module__player"]') ||
    document.querySelector('[class*="video-player"]') ||
    document.querySelector('video')?.closest('section, div');
  // Find info/title block
  const info =
    document.querySelector('h1') ||
    document.querySelector('[class*="videoTitleSection"]') ||
    document.querySelector('[class*="pageInfoContainerWrapper"]') ||
    document.querySelector('[class*="wdp-videopage-description-module__wrapper"]');

  function chain(el, max = 6) {
    const out = [];
    let cur = el;
    for (let i = 0; i < max && cur; i++) {
      out.push(describe(cur));
      cur = cur.parentElement;
    }
    return out;
  }

  return {
    panel: describe(panel),
    panelChain: panel ? chain(panel.parentElement) : null,
    player: describe(player),
    playerChain: player ? chain(player.parentElement) : null,
    info: describe(info),
    infoChain: info ? chain(info.parentElement) : null,
    panelParent_children: panel ? Array.from(panel.parentElement?.children || []).map(describe) : null,
  };
});

console.log(JSON.stringify(probe, null, 2));
await browser.close();
