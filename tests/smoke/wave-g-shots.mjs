// Wave G smoke: reload extension, verify gear-warning dot, diag
// bullets, capture pulse, hotkey add empty placeholder + auto-focus.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
const OUT = 'C:/Temp/vs-wave-g';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.connectOverCDP('http://localhost:9333');
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

// Find YT
let yt = null;
for (const p of ctx.pages()) if (p.url().includes('youtube.com/watch')) { yt = p; break; }
if (!yt) { console.error('no YT'); await browser.close(); process.exit(1); }
await yt.bringToFront();
await yt.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 5000));

const cdp = await yt.context().newCDPSession(yt);
async function shot(name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
  console.error('  -> ' + name);
}

// 1. Open gear menu, switch to Hotkeys tab
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
await new Promise(r => setTimeout(r, 400));
await yt.evaluate(() => {
  const tab = document.querySelector('[data-vs-tab="hotkeys"]');
  tab?.click();
});
await new Promise(r => setTimeout(r, 400));
await shot('01-hotkeys-tab');

// 2. Click "Add" for speedUp — should add empty slot, auto-focus it
await yt.evaluate(() => {
  document.querySelector('[data-vs-hotkey-add="speedUp"]')?.click();
});
await new Promise(r => setTimeout(r, 500));

const afterAdd = await yt.evaluate(() => {
  const inputs = document.querySelectorAll('.vs-hotkey-row[data-hotkey-type="speedUp"] .vs-hotkey-input');
  const last = inputs[inputs.length - 1];
  return {
    rowCount: inputs.length,
    lastValue: last?.value || '',
    lastIsFocused: document.activeElement === last,
    lastIsCapturing: last?.classList.contains('capturing'),
    placeholder: last?.placeholder || '',
  };
});
console.log('AFTER ADD:', JSON.stringify(afterAdd));
await shot('02-after-add-empty-slot');

// 3. Check Diagnostics tab (auto-refresh)
await yt.evaluate(() => {
  document.querySelector('[data-vs-tab="diag"]')?.click();
});
await new Promise(r => setTimeout(r, 500));
const diagState = await yt.evaluate(() => {
  const status = document.querySelector('[data-vs-diag-status]');
  return {
    state: status?.dataset.state,
    headline: document.querySelector('[data-vs-diag-headline]')?.textContent,
    detail: document.querySelector('[data-vs-diag-detail]')?.textContent,
  };
});
console.log('DIAG TAB:', JSON.stringify(diagState));
await shot('03-diag-tab');

// 4. Check gear has-warning class state
const gearState = await yt.evaluate(() => ({
  hasWarning: document.querySelector('.vs-gear-button')?.classList.contains('has-warning'),
}));
console.log('GEAR WARNING DOT:', JSON.stringify(gearState));

await browser.close();
