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

  const allLogs = [];
  yt.on('console', (m) => {
    const t = m.text();
    if (/VIDEO-SPEEDS|panel|applyLayout|slider|version/i.test(t)) {
      allLogs.push(`[${m.type()}] ${t}`);
    }
  });

  console.error('Reloading YT page...');
  await yt.reload({ waitUntil: 'domcontentloaded' });
  // give content script time to bootstrap + insert panel
  await new Promise(r => setTimeout(r, 5000));

  const state = await yt.evaluate(() => {
    const panel = document.querySelector('.vs-panel');
    const slider = document.querySelector('.speed-slider-container');
    return {
      panelExists: !!panel,
      panelDataPos: panel?.dataset?.vsSliderPosition ?? null,
      panelChildren: panel ? Array.from(panel.children).map(c => c.className) : [],
      sliderParent: slider?.parentElement?.className ?? '(orphan)',
      versionAttr: document.querySelector('.vs-menu-version')?.textContent?.trim() ?? null,
    };
  });
  console.log('--- STATE ---');
  console.log(JSON.stringify(state, null, 2));
  console.log('--- BOOTSTRAP LOGS ---');
  console.log(allLogs.join('\n'));
} finally {
  await browser.close();
}
