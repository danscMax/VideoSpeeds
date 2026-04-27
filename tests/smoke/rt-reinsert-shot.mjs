// Reload extension, refresh RT tab, snap full screenshot to verify
// panel landing position.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
const PORT = 9333;
const OUT = 'C:/Temp/vs-rt-fix';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const ctx = browser.contexts()[0];

// Reload extension
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
if (rect) await ext.mouse.click(rect.x, rect.y);
await new Promise(r => setTimeout(r, 2200));
await ext.close();

// Find RT tab
let rt = null;
for (const p of ctx.pages()) if (p.url().includes('rutube.ru')) { rt = p; break; }
if (!rt) { console.error('no RT'); await browser.close(); process.exit(1); }
await rt.bringToFront();
await rt.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 6000));

const cdp = await rt.context().newCDPSession(rt);
async function shot(name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
  console.error('  -> ' + name);
}

const probe = await rt.evaluate(() => {
  const panel = document.querySelector('.vs-panel');
  if (!panel) return { panelExists: false };
  return {
    panelExists: true,
    parentClass: ((panel.parentElement?.className || '') + '').toString().slice(0, 120),
    parentTag: panel.parentElement?.tagName,
    panelRect: panel.getBoundingClientRect().toJSON(),
  };
});
console.log('PROBE:', JSON.stringify(probe, null, 2));

await shot('full-rt-fixed');
await browser.close();
