// Wave V parity-fix screenshots. Reloads the extension, snaps panel
// layouts (right + bottom + video), opens settings menu and triggers the
// speed popup. Uses ONLY DOM interactions (chrome.storage isn't in page
// world). Output: C:/Temp/vs-wave-v/
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
const PORT = 9333;
const OUT = 'C:/Temp/vs-wave-v';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const ctx = browser.contexts()[0];

// Find YT tab. We assume the extension was reloaded externally (user
// toggled it via chrome://extensions/) — don't touch it from here, the
// chrome://extensions DOM trick is unreliable across Chromium versions.
let yt = null;
for (const p of ctx.pages()) {
  if (p.url().includes('youtube.com/watch')) { yt = p; break; }
}
if (!yt) { console.error('no YT tab'); await browser.close(); process.exit(1); }

await yt.bringToFront();
await yt.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 4000));

const cdp = await yt.context().newCDPSession(yt);
async function shot(name, clip) {
  try {
    const r = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
    });
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
    console.error('  -> ' + name + '.png');
  } catch (e) {
    console.error('  shot failed: ' + name + ' — ' + e.message);
  }
}

async function panelShot(name, padX = 40, padY = 30) {
  const info = await yt.evaluate(() => {
    const p = document.querySelector('.vs-panel');
    if (!p) return null;
    p.scrollIntoView({ block: 'center', behavior: 'instant' });
    return {
      rect: p.getBoundingClientRect().toJSON(),
      vp: { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight },
    };
  });
  if (!info) { console.error('  no panel for ' + name); return; }
  await new Promise(r => setTimeout(r, 200));
  await shot(name, {
    x: Math.max(0, info.rect.x - padX),
    y: Math.max(0, info.rect.y - padY),
    width: Math.min(info.vp.w, info.rect.width + padX * 2),
    height: Math.min(info.vp.h, info.rect.height + padY * 2),
  });
}

async function setSliderPositionViaMenu(pos) {
  // Open gear menu, click the slider position segmented option, close menu
  await yt.evaluate(() => {
    const m = document.querySelector('.settings-menu.show');
    if (!m) document.querySelector('.vs-gear-button')?.click();
  });
  await new Promise(r => setTimeout(r, 350));
  await yt.evaluate((p) => {
    const opt = document.querySelector(`.settings-menu .vs-segmented-option[data-vs-pos="${p}"]`);
    if (opt) opt.click();
  }, pos);
  await new Promise(r => setTimeout(r, 350));
  // Close menu by clicking outside
  await yt.evaluate(() => {
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 600));
}

// === SHOTS ===

// 0. Initial state probe
const initialProbe = await yt.evaluate(() => ({
  panelExists: !!document.querySelector('.vs-panel'),
  panelLayout: document.querySelector('.vs-panel')?.getAttribute('data-vs-slider-position'),
  hasFloatingValue: !!document.querySelector('.speed-value'),
  hasFilledGear: !!document.querySelector('.vs-gear-button svg[data-filled]'),
  rate: document.querySelector('video')?.playbackRate,
  speedSelectionLabel: document.querySelector('.speed-slider-label')?.textContent,
  popupRightAnchor: !!document.getElementById('speed-popup'),
}));
console.log('INITIAL PROBE: ' + JSON.stringify(initialProbe, null, 2));

// 1. RIGHT layout (default)
await setSliderPositionViaMenu('right');
await panelShot('01-yt-right-default', 60, 40);

// 2. RIGHT + slider hover (show floating tooltip)
await yt.locator('.speed-slider-container').first().hover().catch(() => {});
await new Promise(r => setTimeout(r, 300));
await panelShot('02-yt-right-slider-hover', 80, 80);

// 3. BOTTOM layout
await setSliderPositionViaMenu('bottom');
await panelShot('03-yt-bottom', 60, 40);

// 4. VIDEO (in-chrome) layout
await setSliderPositionViaMenu('video');
await new Promise(r => setTimeout(r, 600));
{
  const info = await yt.evaluate(() => {
    const ctrl = document.querySelector('.ytp-right-controls');
    if (!ctrl) return null;
    return {
      rect: ctrl.getBoundingClientRect().toJSON(),
      vp: { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight },
    };
  });
  if (info) {
    await shot('04-yt-video-mode-chrome', {
      x: Math.max(0, info.rect.x - 280),
      y: Math.max(0, info.rect.y - 30),
      width: Math.min(info.vp.w, info.rect.width + 320),
      height: info.rect.height + 70,
    });
  }
}

// Reset to right
await setSliderPositionViaMenu('right');

// 5. Settings menu open (glass + animation visible)
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
await new Promise(r => setTimeout(r, 500));
{
  const info = await yt.evaluate(() => {
    const m = document.querySelector('.settings-menu.show');
    if (!m) return null;
    return {
      rect: m.getBoundingClientRect().toJSON(),
      vp: { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight },
    };
  });
  if (info) {
    await shot('05-yt-settings-menu', {
      x: Math.max(0, info.rect.x - 16),
      y: Math.max(0, info.rect.y - 16),
      width: Math.min(info.vp.w - Math.max(0, info.rect.x - 16), info.rect.width + 32),
      height: Math.min(info.vp.h - Math.max(0, info.rect.y - 16), info.rect.height + 32),
    });
  } else {
    console.error('  settings menu not visible');
  }
}

// Close menu
await yt.evaluate(() => document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })));
await new Promise(r => setTimeout(r, 350));

// 6. Speed popup (click 2x button)
await yt.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('.speed-button'));
  const target = btns.find(b => /^2x$/.test(b.textContent.trim())) || btns[0];
  target?.click();
});
await new Promise(r => setTimeout(r, 400));
{
  const info = await yt.evaluate(() => {
    const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-container');
    if (!player) return null;
    return {
      rect: player.getBoundingClientRect().toJSON(),
      vp: { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight },
    };
  });
  if (info) {
    await shot('06-yt-speed-popup', {
      x: Math.max(0, info.rect.x),
      y: Math.max(0, info.rect.y),
      width: Math.min(info.vp.w, info.rect.width),
      height: Math.min(info.vp.h, info.rect.height),
    });
  }
}

// Final probe
const probe = await yt.evaluate(() => {
  const popup = document.getElementById('speed-popup');
  return {
    rate: document.querySelector('video')?.playbackRate,
    active: document.querySelector('.speed-button.active')?.textContent,
    panelLayout: document.querySelector('.vs-panel')?.getAttribute('data-vs-slider-position'),
    hasFloatingValue: !!document.querySelector('.speed-value'),
    hasFilledGear: !!document.querySelector('.vs-gear-button svg[data-filled]'),
    popupRect: popup?.getBoundingClientRect().toJSON(),
    popupSiteAttr: popup?.getAttribute('data-vs-site'),
    popupComputed: popup ? {
      right: getComputedStyle(popup).right,
      left: getComputedStyle(popup).left,
      fontSize: getComputedStyle(popup).fontSize,
    } : null,
    modalBackdrop: getComputedStyle(document.querySelector('.settings-menu') || document.documentElement).backdropFilter,
  };
});
console.log('FINAL PROBE: ' + JSON.stringify(probe, null, 2));

await browser.close();
