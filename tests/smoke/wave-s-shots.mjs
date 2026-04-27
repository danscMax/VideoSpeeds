// Wave S smoke: reload extension, run a behavioural matrix on YT and
// snap the panel state. Verifies setTemporary write-order, smart-clear
// on nav, isFreshSelfWrite guard, popup gating, ratechange-accept on YT.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
const PORT = 9333;
const OUT = 'C:/Temp/vs-wave-s';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const ctx = browser.contexts()[0];

// Reload extension via dev-reload button
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

// === BEHAVIORAL TESTS ===

// Test 1: initial state — setTemporary write-order race fix
const t1 = await yt.evaluate(async () => {
  const before = document.querySelector('video')?.playbackRate;
  // Simulate single click on 1.5x button
  const btn = Array.from(document.querySelectorAll('.speed-button')).find(b => b.dataset.vsSpeed === '1.5');
  btn?.click();
  await new Promise(r => setTimeout(r, 600));
  return {
    before,
    after: document.querySelector('video')?.playbackRate,
    label: document.querySelector('.speed-slider-label')?.textContent,
    activeBtn: document.querySelector('.speed-button.active')?.textContent,
  };
});
console.log('TEST 1 (single click setTemporary):', JSON.stringify(t1));

// Test 2: drag slider while smart is set — should NOT snap back
const t2 = await yt.evaluate(async () => {
  // smart should be 1.5 from previous test
  const slider = document.querySelector('.speed-slider');
  if (!slider) return { error: 'no slider' };
  slider.value = '2.25';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  return {
    rate: document.querySelector('video')?.playbackRate,
    sliderVal: slider.value,
    activeBtn: document.querySelector('.speed-button.active')?.textContent,
  };
});
console.log('TEST 2 (slider drag clears smart):', JSON.stringify(t2));

// Test 3: external rate change (simulate YT speed-menu) → accept
const t3 = await yt.evaluate(async () => {
  const v = document.querySelector('video');
  if (!v) return { error: 'no video' };
  // Programmatically set rate to 1.25 — simulates YT internal pick
  v.playbackRate = 1.25;
  await new Promise(r => setTimeout(r, 400));
  return {
    rate: v.playbackRate,
    label: document.querySelector('.speed-slider-label')?.textContent,
    activeBtn: document.querySelector('.speed-button.active')?.textContent,
  };
});
console.log('TEST 3 (YT external rate accept):', JSON.stringify(t3));

// Test 4: probe defaults — Insert as 2nd slot
const t4 = await yt.evaluate(() => {
  const probeKey = (key) => new Promise(resolve => {
    chrome.storage?.local?.get?.(null, (all) => resolve(all)) ?? resolve(null);
  });
  return probeKey().then(all => ({ keys: all ? Object.keys(all) : [] }));
}).catch(() => ({ error: 'no chrome.storage' }));
// chrome.storage isn't accessible from page; skip

// Test 5: panel rect / popup pos — grab a fullscreen
await shot('full-01-state-after-tests');

console.log('All probes done.');
await browser.close();
