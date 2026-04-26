// Targeted screenshots for missing pieces: bottom panel (full) + RuTube panel.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const PORT = 9333;
const OUT = 'C:/Temp/vs-audit-2';

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
function findPage(p) { for (const c of browser.contexts()) for (const x of c.pages()) if (p(x)) return x; return null; }
async function shot(cdp, name, clip) {
  try {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
    console.error('  -> ' + name);
  } catch (e) { console.error('X ' + name + ': ' + e.message.slice(0, 100)); }
}

const yt = findPage(p => p.url().includes('youtube.com'));
const ytCdp = await yt.context().newCDPSession(yt);

// Make sure we are in BOTTOM layout, scroll panel into view
await yt.evaluate(() => {
  const m = document.querySelector('.settings-menu');
  if (m && m.style.display === 'none') document.querySelector('.vs-gear-button')?.click();
});
await new Promise(r => setTimeout(r, 200));
await yt.evaluate(() => document.querySelector('[data-vs-pos="bottom"]')?.click());
await new Promise(r => setTimeout(r, 800));
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
await new Promise(r => setTimeout(r, 200));

// Scroll panel into view, take fresh rect
await yt.evaluate(() => document.querySelector('.vs-panel')?.scrollIntoView({ behavior: 'instant', block: 'center' }));
await new Promise(r => setTimeout(r, 500));
const bb = await yt.evaluate(() => document.querySelector('.vs-panel')?.getBoundingClientRect());
console.log('bottom panel rect:', bb);
if (bb) await shot(ytCdp, '06-bottom-panel-fixed', { x: Math.max(0, bb.x - 10), y: Math.max(0, bb.y - 10), width: bb.width + 20, height: bb.height + 20 });

// Open menu in bottom -- check menu position relative to gear at right edge
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
await new Promise(r => setTimeout(r, 400));
const bm = await yt.evaluate(() => {
  const p = document.querySelector('.vs-panel');
  const m = document.querySelector('.settings-menu');
  if (!p || !m) return null;
  const pr = p.getBoundingClientRect(), mr = m.getBoundingClientRect();
  const x = Math.max(0, Math.min(pr.x, mr.x) - 10);
  const y = Math.max(0, Math.min(pr.y, mr.y) - 10);
  return {
    x, y,
    width: Math.max(pr.right, mr.right) - x + 10,
    height: Math.max(pr.bottom, mr.bottom) - y + 10,
    menuFlip: m.getAttribute('data-vs-flip'),
  };
});
console.log('bottom + menu:', bm);
if (bm) await shot(ytCdp, '06b-bottom-with-menu', bm);

// Close menu, switch to right (default)
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
await new Promise(r => setTimeout(r, 300));
await yt.evaluate(() => {
  const m = document.querySelector('.settings-menu');
  if (m && m.style.display === 'none') document.querySelector('.vs-gear-button')?.click();
});
await new Promise(r => setTimeout(r, 200));
await yt.evaluate(() => document.querySelector('[data-vs-pos="right"]')?.click());
await new Promise(r => setTimeout(r, 600));
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
await new Promise(r => setTimeout(r, 200));

// === RUTUBE ===
const rt = findPage(p => p.url().includes('rutube.ru'));
if (rt) {
  const rtCdp = await rt.context().newCDPSession(rt);
  // Force panel to scroll into view
  await rt.evaluate(() => document.querySelector('.vs-panel')?.scrollIntoView({ behavior: 'instant', block: 'center' }));
  await new Promise(r => setTimeout(r, 500));
  await shot(rtCdp, '08-rt-fullpage');
  const rb = await rt.evaluate(() => {
    const p = document.querySelector('.vs-panel');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return { rect: r, parent: p.parentElement?.tagName + (p.parentElement?.className ? '.' + p.parentElement.className.split(' ').slice(0, 3).join(' ') : ''), overlap: null };
  });
  console.log('RT panel:', rb);
  if (rb?.rect) await shot(rtCdp, '09-rt-panel', { x: Math.max(0, rb.rect.x - 10), y: Math.max(0, rb.rect.y - 10), width: rb.rect.width + 20, height: rb.rect.height + 20 });

  // Check what's around it
  const ctx = await rt.evaluate(() => {
    const p = document.querySelector('.vs-panel');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    // Get viewport-wide context — rectangle from x=0 to viewport-width at panel y
    return {
      vpW: document.documentElement.clientWidth,
      vpH: document.documentElement.clientHeight,
      parentClass: p.parentElement?.className,
      parentRect: p.parentElement?.getBoundingClientRect(),
      siblings: Array.from(p.parentElement?.children || []).map(c => ({ cls: c.className, tag: c.tagName, rect: c.getBoundingClientRect() })),
    };
  });
  console.log('RT context:', JSON.stringify(ctx, null, 2));

  // Wider screenshot showing panel + surrounding
  if (rb?.rect && ctx) {
    const pad = 200;
    await shot(rtCdp, '09b-rt-panel-context', {
      x: Math.max(0, rb.rect.x - pad),
      y: Math.max(0, rb.rect.y - pad/2),
      width: Math.min(ctx.vpW, rb.rect.width + pad*2),
      height: Math.min(ctx.vpH, rb.rect.height + pad),
    });
  }
}

await browser.close();
