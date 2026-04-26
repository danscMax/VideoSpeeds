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

  console.error('Reload YT...');
  await yt.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 5000));

  // Force video mode
  console.error('Open menu and click video...');
  await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
  await new Promise(r => setTimeout(r, 400));
  await yt.evaluate(() => document.querySelector('[data-vs-pos="video"]')?.click());
  await new Promise(r => setTimeout(r, 800));

  const probe = await yt.evaluate(() => {
    const sc = document.querySelector('.speed-slider-container.vs-slider-in-chrome');
    if (!sc) return { error: 'slider not in chrome' };
    const slider = sc.querySelector('.speed-slider');
    const label = sc.querySelector('.speed-slider-label');
    const labelCs = label ? getComputedStyle(label) : null;
    return {
      version: document.querySelector('.vs-menu-version')?.textContent?.trim(),
      containerRect: sc.getBoundingClientRect(),
      containerHeight: getComputedStyle(sc).height,
      sliderRect: slider?.getBoundingClientRect(),
      labelRect: label?.getBoundingClientRect(),
      labelCs: labelCs ? {
        display: labelCs.display,
        height: labelCs.height,
        lineHeight: labelCs.lineHeight,
        fontSize: labelCs.fontSize,
        alignItems: labelCs.alignItems,
        margin: labelCs.margin,
        padding: labelCs.padding,
      } : null,
    };
  });
  console.log(JSON.stringify(probe, null, 2));

  await yt.mouse.move(640, 360);
  await new Promise(r => setTimeout(r, 300));
  await yt.screenshot({ path: 'C:/Temp/vs-pos-video-fixed.png', fullPage: false });
  console.error('saved C:/Temp/vs-pos-video-fixed.png');
} finally {
  await browser.close();
}
