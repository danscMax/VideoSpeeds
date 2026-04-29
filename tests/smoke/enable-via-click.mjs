// Use real Playwright click to toggle the extension on.
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9333');
const ctx = browser.contexts()[0];

const ext = await ctx.newPage();
await ext.goto('chrome://extensions/');
await new Promise(r => setTimeout(r, 1500));

// Inspect for path to the enableToggle
const path = await ext.evaluate(() => {
  const root = document.querySelector('extensions-manager');
  const items = root?.shadowRoot?.querySelector('extensions-item-list');
  const rows = Array.from(items?.shadowRoot?.querySelectorAll('extensions-item') ?? []);
  const r = rows[0];
  return r?.shadowRoot?.querySelector('#enableToggle')?.tagName;
});
console.log('toggle tag:', path);

// Use mouse-click: get screen rect
const rect = await ext.evaluate(() => {
  const root = document.querySelector('extensions-manager');
  const items = root?.shadowRoot?.querySelector('extensions-item-list');
  const rows = Array.from(items?.shadowRoot?.querySelectorAll('extensions-item') ?? []);
  const tog = rows[0]?.shadowRoot?.querySelector('#enableToggle');
  if (!tog) return null;
  const r = tog.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
console.log('toggle rect:', rect);

if (rect) {
  await ext.mouse.click(rect.x, rect.y);
  await new Promise(r => setTimeout(r, 2000));
  const after = await ext.evaluate(() => {
    const root = document.querySelector('extensions-manager');
    const items = root?.shadowRoot?.querySelector('extensions-item-list');
    const rows = Array.from(items?.shadowRoot?.querySelectorAll('extensions-item') ?? []);
    const tog = rows[0]?.shadowRoot?.querySelector('#enableToggle');
    return { checked: tog?.checked, ariaPressed: tog?.getAttribute('aria-pressed') };
  });
  console.log('AFTER:', JSON.stringify(after));
}
await ext.close();

// Probe YT
let yt = null;
for (const p of ctx.pages()) if (p.url().includes('youtube.com')) { yt = p; break; }
if (!yt) { yt = await ctx.newPage(); await yt.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw'); }

const logs = [];
yt.on('console', m => {
  const t = m.text();
  if (t.includes('VIDEO-SPEEDS') || m.type() === 'error') logs.push(`[${m.type()}] ${t.slice(0, 250)}`);
});
yt.on('pageerror', e => logs.push(`[PAGEERROR] ${e.message}`));
await yt.bringToFront();
await yt.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 5000));

const probe = await yt.evaluate(() => ({
  vsExt: document.documentElement.dataset.vsExtActive,
  panelExists: !!document.querySelector('.vs-panel'),
  hasFloatingValue: !!document.querySelector('.speed-value'),
  hasFilledGear: !!document.querySelector('.vs-gear-button svg[data-filled]'),
}));
console.log('PROBE:', JSON.stringify(probe));
for (const l of logs.slice(-10)) console.log(l);
await browser.close();
