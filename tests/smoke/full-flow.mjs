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

  const logs = [];
  yt.on('console', (m) => {
    const t = m.text();
    if (/VIDEO-SPEEDS|panel|applyLayout|slider|sliderPosition/i.test(t)) {
      logs.push(`[${m.type()}] ${t}`);
    }
  });

  // Step 1: open the menu so we can see the version AND ensure radio is in DOM
  await yt.evaluate(() => {
    const gear = document.querySelector('.vs-gear-button');
    if (gear) gear.click();
  });
  await new Promise(r => setTimeout(r, 300));

  const beforeVideo = await yt.evaluate(() => ({
    version: document.querySelector('.vs-menu-version')?.textContent?.trim() ?? null,
    panelDataPos: document.querySelector('.vs-panel')?.dataset?.vsSliderPosition ?? null,
    sliderParent: document.querySelector('.speed-slider-container')?.parentElement?.className ?? '(none)',
    radioPressed: Array.from(document.querySelectorAll('[data-vs-pos]')).map(b => `${b.dataset.vsPos}:${b.getAttribute('aria-pressed')}`),
  }));
  console.log('--- BEFORE click-video ---');
  console.log(JSON.stringify(beforeVideo, null, 2));

  // Step 2: click "video" radio
  await yt.evaluate(() => {
    const r = document.querySelector('[data-vs-pos="video"]');
    if (r) r.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  const afterVideo = await yt.evaluate(() => ({
    panelDataPos: document.querySelector('.vs-panel')?.dataset?.vsSliderPosition ?? null,
    sliderParent: document.querySelector('.speed-slider-container')?.parentElement?.className ?? '(none)',
    sliderHasInChromeClass: document.querySelector('.speed-slider-container')?.classList?.contains('vs-slider-in-chrome'),
    sliderInChrome: !!document.querySelector('.ytp-right-controls .speed-slider-container'),
    radioPressed: Array.from(document.querySelectorAll('[data-vs-pos]')).map(b => `${b.dataset.vsPos}:${b.getAttribute('aria-pressed')}`),
  }));
  console.log('--- AFTER click-video ---');
  console.log(JSON.stringify(afterVideo, null, 2));

  // Step 3: click "right" radio (back to default)
  await yt.evaluate(() => {
    const r = document.querySelector('[data-vs-pos="right"]');
    if (r) r.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  const afterRight = await yt.evaluate(() => ({
    panelDataPos: document.querySelector('.vs-panel')?.dataset?.vsSliderPosition ?? null,
    sliderParent: document.querySelector('.speed-slider-container')?.parentElement?.className ?? '(none)',
    sliderInChrome: !!document.querySelector('.ytp-right-controls .speed-slider-container'),
  }));
  console.log('--- AFTER click-right ---');
  console.log(JSON.stringify(afterRight, null, 2));

  console.log('--- LOGS ---');
  console.log(logs.join('\n'));
} finally {
  await browser.close();
}
