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

  // Open menu
  await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
  await new Promise(r => setTimeout(r, 400));

  // Click bottom
  await yt.evaluate(() => document.querySelector('[data-vs-pos="bottom"]')?.click());
  await new Promise(r => setTimeout(r, 800));

  const layout = await yt.evaluate(() => {
    const panel = document.querySelector('.vs-panel');
    const menu = document.querySelector('.settings-menu');
    const gear = document.querySelector('.vs-gear-wrapper');
    const buttons = document.querySelector('.speed-buttons-row');
    const slider = document.querySelector('.speed-slider-container');
    return {
      version: document.querySelector('.vs-menu-version')?.textContent?.trim(),
      panelDataPos: panel?.dataset?.vsSliderPosition,
      panelDisplay: panel ? getComputedStyle(panel).display : null,
      panelGridAreas: panel ? getComputedStyle(panel).gridTemplateAreas : null,
      buttonsRect: buttons?.getBoundingClientRect(),
      gearRect: gear?.getBoundingClientRect(),
      sliderRect: slider?.getBoundingClientRect(),
      menuRect: menu?.getBoundingClientRect(),
      menuFlip: menu?.getAttribute('data-vs-flip'),
      menuVisible: menu?.style?.display !== 'none',
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  console.log(JSON.stringify(layout, null, 2));

  await yt.mouse.move(640, 360);
  await new Promise(r => setTimeout(r, 300));
  await yt.screenshot({ path: 'C:/Temp/vs-pos-bottom-fixed.png', fullPage: false });
  console.error('saved C:/Temp/vs-pos-bottom-fixed.png');
} finally {
  await browser.close();
}
