// Reload YT page fresh and capture content-script logs from the start.
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9333');
const ctx = browser.contexts()[0];

let yt = null;
for (const p of ctx.pages()) if (p.url().includes('youtube.com')) { yt = p; break; }
if (!yt) {
  yt = await ctx.newPage();
  await yt.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw');
}

const logs = [];
yt.on('console', m => {
  const t = m.text();
  if (t.includes('VIDEO-SPEEDS') || t.includes('[VS]') || m.type() === 'error') {
    logs.push(`[${m.type()}] ${t.slice(0, 300)}`);
  }
});
yt.on('pageerror', e => logs.push(`[PAGEERROR] ${e.message}`));

await yt.bringToFront();
await yt.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 6000));

const probe = await yt.evaluate(() => ({
  url: location.href,
  vsExt: document.documentElement.dataset.vsExtActive,
  panelExists: !!document.querySelector('.vs-panel'),
  styleTag: !!document.getElementById('vs-styles'),
}));
console.log('PROBE:', JSON.stringify(probe, null, 2));
console.log('--- VS / error logs ---');
for (const l of logs) console.log(l);
await browser.close();
