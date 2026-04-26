// Probe sliderPosition via CDP on the running Chrome-for-Testing instance.
// Usage: node tests/smoke/probe-slider-pos.mjs <command>
//   command = inspect | click-video | click-bottom | click-right | logs
import { chromium } from 'playwright';

const cmd = process.argv[2] ?? 'inspect';
const PORT = 9333;
const YT = 'youtube.com';

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
try {
  const ctxs = browser.contexts();
  let targetPage = null;
  for (const ctx of ctxs) {
    for (const p of ctx.pages()) {
      if (p.url().includes(YT)) { targetPage = p; break; }
    }
    if (targetPage) break;
  }
  if (!targetPage) {
    console.error(JSON.stringify({ error: 'no YouTube tab found' }));
    process.exit(1);
  }
  console.error(`Found YT page: ${targetPage.url()}`);

  // Console log capture (will only see NEW messages from this point on)
  const logs = [];
  targetPage.on('console', (msg) => {
    if (/VIDEO-SPEEDS|panel|applyLayout|slider/i.test(msg.text())) {
      logs.push(`[${msg.type()}] ${msg.text()}`);
    }
  });

  if (cmd === 'inspect') {
    const out = await targetPage.evaluate(() => {
      const panel = document.querySelector('.vs-panel');
      const slider = document.querySelector('.speed-slider-container');
      const settingsMenu = document.querySelector('.settings-menu');
      const radioBtns = document.querySelectorAll('[data-vs-pos]');
      return {
        panelExists: !!panel,
        panelDataPos: panel?.dataset?.vsSliderPosition ?? null,
        panelChildren: panel ? Array.from(panel.children).map(c => c.className) : [],
        panelParent: panel?.parentElement?.tagName + '#' + (panel?.parentElement?.id || ''),
        sliderExists: !!slider,
        sliderParent: slider?.parentElement?.className ?? '(orphan)',
        sliderHasInChromeClass: slider?.classList.contains('vs-slider-in-chrome') ?? false,
        settingsMenuVisible: settingsMenu ? settingsMenu.style.display !== 'none' : false,
        radioCount: radioBtns.length,
        radioPressed: Array.from(radioBtns).map(b => `${b.dataset.vsPos}:${b.getAttribute('aria-pressed')}`),
        rightControlsExists: !!document.querySelector('.ytp-right-controls'),
        chromeFirstChild: document.querySelector('.ytp-right-controls')?.firstChild?.constructor?.name + '/' + (document.querySelector('.ytp-right-controls')?.firstElementChild?.className ?? ''),
      };
    });
    console.log(JSON.stringify(out, null, 2));
  } else if (cmd === 'open-menu') {
    const out = await targetPage.evaluate(() => {
      const gear = document.querySelector('.vs-gear-button');
      if (!gear) return { error: 'no gear button' };
      gear.click();
      return {
        clicked: true,
        menuVisible: document.querySelector('.settings-menu')?.style?.display !== 'none',
      };
    });
    console.log(JSON.stringify(out, null, 2));
  } else if (cmd.startsWith('click-')) {
    const pos = cmd.replace('click-', '');
    const out = await targetPage.evaluate((p) => {
      // First, ensure menu is open
      const gear = document.querySelector('.vs-gear-button');
      const menu = document.querySelector('.settings-menu');
      if (menu && menu.style.display === 'none' && gear) gear.click();
      const before = {
        sliderParent: document.querySelector('.speed-slider-container')?.parentElement?.className,
        panelDataPos: document.querySelector('.vs-panel')?.dataset?.vsSliderPosition,
      };
      const radio = document.querySelector(`[data-vs-pos="${p}"]`);
      if (!radio) return { error: `no radio for pos=${p}`, before };
      radio.click();
      return { clicked: true, before, after: 'check via inspect after a small delay' };
    }, pos);
    console.log(JSON.stringify(out, null, 2));
    // wait a bit for async update + applyLayout
    await new Promise(r => setTimeout(r, 800));
    const post = await targetPage.evaluate(() => ({
      panelDataPos: document.querySelector('.vs-panel')?.dataset?.vsSliderPosition ?? null,
      sliderParent: document.querySelector('.speed-slider-container')?.parentElement?.className ?? '(orphan)',
      sliderHasInChromeClass: document.querySelector('.speed-slider-container')?.classList?.contains('vs-slider-in-chrome'),
      radioPressed: Array.from(document.querySelectorAll('[data-vs-pos]')).map(b => `${b.dataset.vsPos}:${b.getAttribute('aria-pressed')}`),
      chromeContainsSlider: !!document.querySelector('.ytp-right-controls .speed-slider-container'),
    }));
    console.log('--- POST ---');
    console.log(JSON.stringify(post, null, 2));
    console.log('--- LOGS captured ---');
    console.log(logs.join('\n'));
  }
} finally {
  await browser.close();
}
