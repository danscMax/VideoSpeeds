// Set RT to bottom layout via menu, screenshot.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
const OUT = 'C:/Temp/vs-rt-fix';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.connectOverCDP('http://localhost:9333');
const ctx = browser.contexts()[0];
let rt = null;
for (const p of ctx.pages()) if (p.url().includes('rutube.ru')) { rt = p; break; }
if (!rt) { console.error('no RT'); process.exit(1); }
await rt.bringToFront();
await rt.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 6000));

// Open gear menu, click 'bottom' position
await rt.evaluate(() => {
  if (!document.querySelector('.settings-menu.show')) document.querySelector('.vs-gear-button')?.click();
});
await new Promise(r => setTimeout(r, 400));
await rt.evaluate(() => {
  const opt = document.querySelector('.settings-menu .vs-segmented-option[data-vs-pos="bottom"]');
  opt?.click();
});
await new Promise(r => setTimeout(r, 400));
await rt.evaluate(() => document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })));
await new Promise(r => setTimeout(r, 800));

const probe = await rt.evaluate(() => {
  const panel = document.querySelector('.vs-panel');
  const gear = document.querySelector('.vs-gear-wrapper');
  return {
    layout: panel?.getAttribute('data-vs-slider-position'),
    panelRect: panel?.getBoundingClientRect().toJSON(),
    gearRect: gear?.getBoundingClientRect().toJSON(),
  };
});
console.log('PROBE:', JSON.stringify(probe, null, 2));

const cdp = await rt.context().newCDPSession(rt);
const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${OUT}/full-rt-bottom-fixed.png`, Buffer.from(r.data, 'base64'));
console.log('-> full-rt-bottom-fixed.png');
await browser.close();
