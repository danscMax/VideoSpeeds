// Just connect + probe; no reload tricks.
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9333');
const ctx = browser.contexts()[0];
let yt = null;
for (const p of ctx.pages()) if (p.url().includes('youtube.com')) { yt = p; break; }
if (!yt) { console.error('no YT'); process.exit(1); }

const logs = [];
yt.on('console', m => logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
yt.on('pageerror', e => logs.push(`[ERROR] ${e.message}`));

await yt.bringToFront();
await new Promise(r => setTimeout(r, 4000));

const probe = await yt.evaluate(() => ({
  url: location.href,
  vsExt: document.documentElement.dataset.vsExtActive,
  vsTm: document.documentElement.dataset.vsTmActive,
  panelExists: !!document.querySelector('.vs-panel'),
  panelHTML: document.querySelector('.vs-panel')?.outerHTML?.slice(0, 800),
  videoExists: !!document.querySelector('video.html5-main-video'),
  metadata: !!document.querySelector('ytd-watch-metadata'),
  styleTagExists: !!document.getElementById('vs-styles'),
  contentScripts: Array.from(document.scripts).map(s => s.src).filter(s => s.includes('chrome-extension')),
}));
console.log('PROBE:', JSON.stringify(probe, null, 2));

console.log('--- Recent logs ---');
for (const l of logs.slice(-30)) console.log(l);

await browser.close();
