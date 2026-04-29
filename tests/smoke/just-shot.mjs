import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const browser = await chromium.connectOverCDP('http://localhost:9333');
const ctx = browser.contexts()[0];
let yt = null;
for (const p of ctx.pages()) if (p.url().includes('youtube.com/watch')) { yt = p; break; }
if (!yt) { console.error('no YT'); process.exit(1); }
const cdp = await yt.context().newCDPSession(yt);

const probe = await yt.evaluate(() => {
  const panel = document.querySelector('.vs-panel');
  const slider = document.querySelector('.speed-slider-container');
  return {
    panelRect: panel?.getBoundingClientRect()?.toJSON(),
    sliderRect: slider?.getBoundingClientRect()?.toJSON(),
    sliderComputed: slider ? {
      width: getComputedStyle(slider).width,
      flex: getComputedStyle(slider).flex,
    } : null,
  };
});
console.log('PROBE:', JSON.stringify(probe, null, 2));

const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('C:/Temp/vs-wave-v/full-01-right-fixed.png', Buffer.from(r.data, 'base64'));
console.log('-> full-01-right-fixed.png');
await browser.close();
