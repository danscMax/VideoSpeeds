import { chromium } from 'playwright';

const PORT = 9333;
const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
try {
  // 1. Reload extension
  let extPage = null;
  let yt = null;
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (p.url().startsWith('chrome://extensions')) extPage = p;
      else if (p.url().includes('youtube.com')) yt = p;
    }
  }
  if (!extPage) { console.error('no chrome://extensions tab'); process.exit(1); }
  if (!yt) { console.error('no youtube tab'); process.exit(1); }

  console.error('Step 1: reload extension...');
  await extPage.evaluate(() => {
    const mgr = document.querySelector('extensions-manager');
    const list = mgr.shadowRoot.querySelector('extensions-item-list');
    const items = list.shadowRoot.querySelectorAll('extensions-item');
    for (const it of items) {
      const reloadBtn = it.shadowRoot.querySelector('#dev-reload-button');
      if (reloadBtn) reloadBtn.click();
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  // 2. Capture console BEFORE reload
  const logs = [];
  yt.on('console', (m) => {
    const t = m.text();
    if (/VIDEO-SPEEDS|panel|applyLayout|slider|sliderPosition|version/i.test(t)) {
      logs.push(`[${m.type()}] ${t}`);
    }
  });

  // 3. Reload YouTube
  console.error('Step 2: reload YT page...');
  await yt.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 5000));

  // 4. Open menu
  console.error('Step 3: open menu...');
  await yt.evaluate(() => {
    const gear = document.querySelector('.vs-gear-button');
    if (gear) gear.click();
  });
  await new Promise(r => setTimeout(r, 500));

  // 5. Inspect
  const before = await yt.evaluate(() => ({
    version: document.querySelector('.vs-menu-version')?.textContent?.trim() ?? null,
    panelDataPos: document.querySelector('.vs-panel')?.dataset?.vsSliderPosition ?? null,
    sliderParent: document.querySelector('.speed-slider-container')?.parentElement?.className ?? null,
    radioPressed: Array.from(document.querySelectorAll('[data-vs-pos]')).map(b => `${b.dataset.vsPos}:${b.getAttribute('aria-pressed')}`),
  }));
  console.log('--- AFTER reload ---');
  console.log(JSON.stringify(before, null, 2));

  // 6. Click video
  console.error('Step 4: click video...');
  await yt.evaluate(() => {
    const r = document.querySelector('[data-vs-pos="video"]');
    if (r) r.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  const afterVideo = await yt.evaluate(() => ({
    panelDataPos: document.querySelector('.vs-panel')?.dataset?.vsSliderPosition ?? null,
    sliderParent: document.querySelector('.speed-slider-container')?.parentElement?.className ?? null,
    sliderInChrome: !!document.querySelector('.ytp-right-controls .speed-slider-container'),
    sliderHasInChromeClass: document.querySelector('.speed-slider-container')?.classList?.contains('vs-slider-in-chrome'),
  }));
  console.log('--- AFTER click-video ---');
  console.log(JSON.stringify(afterVideo, null, 2));

  // 7. Click bottom
  console.error('Step 5: click bottom...');
  await yt.evaluate(() => {
    const r = document.querySelector('[data-vs-pos="bottom"]');
    if (r) r.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  const afterBottom = await yt.evaluate(() => ({
    panelDataPos: document.querySelector('.vs-panel')?.dataset?.vsSliderPosition ?? null,
    sliderParent: document.querySelector('.speed-slider-container')?.parentElement?.className ?? null,
    sliderInChrome: !!document.querySelector('.ytp-right-controls .speed-slider-container'),
  }));
  console.log('--- AFTER click-bottom ---');
  console.log(JSON.stringify(afterBottom, null, 2));

  console.log('--- LOGS ---');
  console.log(logs.join('\n'));
} finally {
  await browser.close();
}
