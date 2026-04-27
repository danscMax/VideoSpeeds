// Just shot RuTube panel + context.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const PORT = 9333;
const OUT = 'C:/Temp/vs-audit-2';

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
let rt = null;
for (const c of browser.contexts()) for (const p of c.pages()) if (p.url().includes('rutube.ru')) { rt = p; break; }
if (!rt) { console.error('no RT'); await browser.close(); process.exit(1); }

const cdp = await rt.context().newCDPSession(rt);
async function shot(name, clip) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
  console.error('  -> ' + name);
}

// Scroll panel into view
await rt.evaluate(() => document.querySelector('.vs-panel')?.scrollIntoView({ behavior: 'instant', block: 'center' }));
await new Promise(r => setTimeout(r, 600));
const info = await rt.evaluate(() => {
  const p = document.querySelector('.vs-panel');
  if (!p) return null;
  return {
    rect: p.getBoundingClientRect(),
    parent: p.parentElement?.tagName + (p.parentElement?.className ? '.' + p.parentElement.className.split(' ').slice(0, 2).join(' ') : ''),
    parentRect: p.parentElement?.getBoundingClientRect(),
    vp: { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight },
    siblings: Array.from(p.parentElement?.children || []).map(c => c.tagName + '.' + (c.className || '').split(' ').slice(0, 2).join(' ')),
  };
});
console.log(JSON.stringify(info, null, 2));

await shot('09-rt-panel-only', {
  x: Math.max(0, info.rect.x - 5),
  y: Math.max(0, info.rect.y - 5),
  width: info.rect.width + 10,
  height: info.rect.height + 10,
});

// Wide context: panel + surrounding row
const padX = Math.min(400, (info.vp.w - info.rect.width) / 2);
await shot('09b-rt-panel-context', {
  x: Math.max(0, info.rect.x - padX),
  y: Math.max(0, info.rect.y - 80),
  width: Math.min(info.vp.w, info.rect.width + padX * 2),
  height: Math.min(info.vp.h - Math.max(0, info.rect.y - 80), info.rect.height + 160),
});

await browser.close();
