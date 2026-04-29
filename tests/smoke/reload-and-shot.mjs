// Reload extension via dev-reload button in chrome://extensions, then
// reload YT and take fullscreen shots.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
const PORT = 9333;
const OUT = 'C:/Temp/vs-wave-v';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const ctx = browser.contexts()[0];

// Reload via chrome://extensions (dev mode is on now)
const ext = await ctx.newPage();
await ext.goto('chrome://extensions/');
await new Promise(r => setTimeout(r, 1000));
const rect = await ext.evaluate(() => {
  const root = document.querySelector('extensions-manager');
  const items = root?.shadowRoot?.querySelector('extensions-item-list');
  const rows = Array.from(items?.shadowRoot?.querySelectorAll('extensions-item') ?? []);
  const reload = rows[0]?.shadowRoot?.querySelector('#dev-reload-button');
  if (!reload) return null;
  const r = reload.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (rect) {
  await ext.mouse.click(rect.x, rect.y);
  console.log('clicked dev-reload at', rect);
} else {
  console.log('no reload button — extension may not be in dev mode');
}
await new Promise(r => setTimeout(r, 2500));
await ext.close();

// Now reload YT
let yt = null;
for (const p of ctx.pages()) if (p.url().includes('youtube.com/watch')) { yt = p; break; }
if (!yt) { console.error('no YT'); await browser.close(); process.exit(1); }
await yt.bringToFront();
await yt.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 4500));

const cdp = await yt.context().newCDPSession(yt);
async function full(name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
  console.error('  -> ' + name);
}

const probe = await yt.evaluate(() => {
  const panel = document.querySelector('.vs-panel');
  const slider = document.querySelector('.speed-slider-container');
  return {
    panelRect: panel?.getBoundingClientRect()?.toJSON(),
    sliderRect: slider?.getBoundingClientRect()?.toJSON(),
    sliderComputed: slider ? {
      width: getComputedStyle(slider).width,
      flex: getComputedStyle(slider).flex,
      maxWidth: getComputedStyle(slider).maxWidth,
    } : null,
    panelLayout: panel?.getAttribute('data-vs-slider-position'),
  };
});
console.log('PROBE:', JSON.stringify(probe, null, 2));

await full('full-01-right-fixed');
await browser.close();
