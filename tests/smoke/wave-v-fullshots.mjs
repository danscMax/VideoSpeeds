// Full-viewport screenshots — much easier to verify than per-rect crops.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
const PORT = 9333;
const OUT = 'C:/Temp/vs-wave-v';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const ctx = browser.contexts()[0];
let yt = null;
for (const p of ctx.pages()) if (p.url().includes('youtube.com/watch')) { yt = p; break; }
if (!yt) { console.error('no YT'); await browser.close(); process.exit(1); }

const cdp = await yt.context().newCDPSession(yt);
async function full(name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
  console.error('  -> ' + name);
}

// Make sure panel is visible (scroll to top)
await yt.bringToFront();
await yt.evaluate(() => window.scrollTo(0, 0));
await new Promise(r => setTimeout(r, 800));

async function setPos(p) {
  await yt.evaluate(() => {
    if (!document.querySelector('.settings-menu.show')) document.querySelector('.vs-gear-button')?.click();
  });
  await new Promise(r => setTimeout(r, 350));
  await yt.evaluate((p) => {
    const opt = document.querySelector(`.settings-menu .vs-segmented-option[data-vs-pos="${p}"]`);
    if (opt) opt.click();
  }, p);
  await new Promise(r => setTimeout(r, 300));
  await yt.evaluate(() => document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await new Promise(r => setTimeout(r, 600));
}

await setPos('right');
await full('full-01-right');

// hover slider
await yt.locator('.speed-slider-container').first().hover().catch(() => {});
await new Promise(r => setTimeout(r, 400));
await full('full-02-right-hover');

await setPos('bottom');
await full('full-03-bottom');

await setPos('video');
await new Promise(r => setTimeout(r, 800));
await full('full-04-video');

await setPos('right');

// open menu
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
await new Promise(r => setTimeout(r, 400));
await full('full-05-menu-open');

// click 2x for popup
await yt.evaluate(() => document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })));
await new Promise(r => setTimeout(r, 200));
await yt.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('.speed-button'));
  const target = btns.find(b => /^2x$/.test(b.textContent.trim()));
  target?.click();
});
await new Promise(r => setTimeout(r, 250));
await full('full-06-popup');

await browser.close();
