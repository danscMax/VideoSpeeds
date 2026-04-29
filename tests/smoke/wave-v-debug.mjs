// Diagnostic: see what the content script is doing post-reload
import { chromium } from 'playwright';
const PORT = 9333;
const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const ctx = browser.contexts()[0];

// Reload extension
const extPage = await ctx.newPage();
await extPage.goto('chrome://extensions/');
await new Promise(r => setTimeout(r, 800));
const reloadResult = await extPage.evaluate(async () => {
  const root = document.querySelector('extensions-manager');
  const items = root?.shadowRoot?.querySelector('extensions-item-list');
  const rows = Array.from(items?.shadowRoot?.querySelectorAll('extensions-item') ?? []);
  const found = [];
  for (const row of rows) {
    const id = row.id;
    const reload = row.shadowRoot?.querySelector('#dev-reload-button');
    const name = row.shadowRoot?.querySelector('#name')?.textContent;
    found.push({ id, name, hasReload: !!reload });
    reload?.click();
  }
  return found;
});
console.log('Extensions found:', JSON.stringify(reloadResult, null, 2));
await new Promise(r => setTimeout(r, 2500));
await extPage.close();

// Find YouTube tab + listen to console
let yt = null;
for (const p of ctx.pages()) if (p.url().includes('youtube.com/watch')) { yt = p; break; }
if (!yt) { console.error('no YT'); process.exit(1); }

const logs = [];
yt.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
yt.on('pageerror', e => logs.push(`[ERROR] ${e.message}`));

await yt.bringToFront();
await yt.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 6000));

const probe = await yt.evaluate(() => ({
  url: location.href,
  vsExt: document.documentElement.dataset.vsExtActive,
  panelExists: !!document.querySelector('.vs-panel'),
  panelHTML: document.querySelector('.vs-panel')?.outerHTML?.slice(0, 500),
  manifestVersion: document.querySelector('script[src*="content.js"]')?.src ?? 'no-content-script-tag',
  videoPlayer: !!document.querySelector('video.html5-main-video'),
  metadata: !!document.querySelector('ytd-watch-metadata'),
}));
console.log('PROBE:', JSON.stringify(probe, null, 2));

console.log('--- Console logs (last 30) ---');
for (const l of logs.slice(-30)) console.log(l);

await browser.close();
