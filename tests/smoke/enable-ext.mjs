// Toggle the extension to ON, then probe YT.
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9333');
const ctx = browser.contexts()[0];

const ext = await ctx.newPage();
await ext.goto('chrome://extensions/');
await new Promise(r => setTimeout(r, 1200));

const beforeState = await ext.evaluate(() => {
  const root = document.querySelector('extensions-manager');
  const items = root?.shadowRoot?.querySelector('extensions-item-list');
  const rows = Array.from(items?.shadowRoot?.querySelectorAll('extensions-item') ?? []);
  const r = rows[0];
  return {
    name: r?.shadowRoot?.querySelector('#name')?.textContent?.trim(),
    enabled: r?.shadowRoot?.querySelector('#enableToggle')?.checked,
  };
});
console.log('BEFORE:', JSON.stringify(beforeState));

if (beforeState.enabled === false) {
  await ext.evaluate(() => {
    const root = document.querySelector('extensions-manager');
    const items = root?.shadowRoot?.querySelector('extensions-item-list');
    const rows = Array.from(items?.shadowRoot?.querySelectorAll('extensions-item') ?? []);
    const tog = rows[0]?.shadowRoot?.querySelector('#enableToggle');
    tog?.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  const afterState = await ext.evaluate(() => {
    const root = document.querySelector('extensions-manager');
    const items = root?.shadowRoot?.querySelector('extensions-item-list');
    const rows = Array.from(items?.shadowRoot?.querySelectorAll('extensions-item') ?? []);
    const r = rows[0];
    return { enabled: r?.shadowRoot?.querySelector('#enableToggle')?.checked };
  });
  console.log('AFTER toggle:', JSON.stringify(afterState));
}
await ext.close();

// Now reload YT
let yt = null;
for (const p of ctx.pages()) if (p.url().includes('youtube.com')) { yt = p; break; }
if (!yt) { console.error('no YT'); process.exit(1); }
const logs = [];
yt.on('console', m => {
  const t = m.text();
  if (t.includes('VIDEO-SPEEDS') || t.includes('VS') || m.type() === 'error') logs.push(`[${m.type()}] ${t.slice(0, 250)}`);
});
yt.on('pageerror', e => logs.push(`[PAGEERROR] ${e.message}`));

await yt.bringToFront();
await yt.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 5000));

const probe = await yt.evaluate(() => ({
  vsExt: document.documentElement.dataset.vsExtActive,
  panelExists: !!document.querySelector('.vs-panel'),
  styleTag: !!document.getElementById('vs-styles'),
  hasFloatingValue: !!document.querySelector('.speed-value'),
  hasFilledGear: !!document.querySelector('.vs-gear-button svg[data-filled]'),
}));
console.log('PROBE:', JSON.stringify(probe, null, 2));
console.log('--- VS logs ---');
for (const l of logs.slice(-15)) console.log(l);

await browser.close();
