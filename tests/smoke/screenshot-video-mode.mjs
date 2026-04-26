import { chromium } from 'playwright';

const PORT = 9333;
const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
try {
  let yt = null;
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (p.url().includes('youtube.com')) { yt = p; break; }
    }
    if (yt) break;
  }
  if (!yt) { console.error('no YT'); process.exit(1); }

  // Set sliderPosition='video' programmatically (simulating settings click)
  await yt.evaluate(() => {
    const r = document.querySelector('[data-vs-pos="video"]');
    if (r) r.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Hover the player so chrome stays visible
  await yt.mouse.move(400, 250);
  await new Promise(r => setTimeout(r, 500));
  await yt.mouse.move(450, 280);
  await new Promise(r => setTimeout(r, 500));
  await yt.screenshot({ path: 'C:/Temp/vs-pos-video.png', fullPage: false });

  // Show what slider is in chrome and panel
  const state = await yt.evaluate(() => ({
    panelDataPos: document.querySelector('.vs-panel')?.dataset?.vsSliderPosition,
    sliderInChrome: !!document.querySelector('.ytp-right-controls .speed-slider-container'),
    sliderRect: document.querySelector('.speed-slider-container')?.getBoundingClientRect(),
    chromeRect: document.querySelector('.ytp-right-controls')?.getBoundingClientRect(),
  }));
  console.log(JSON.stringify(state, null, 2));
} finally {
  await browser.close();
}
