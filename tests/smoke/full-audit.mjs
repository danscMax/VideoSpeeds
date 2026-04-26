import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const PORT = 9333;
const OUT_DIR = 'C:/Temp/vs-audit';
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);

function findPage(predicate) {
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (predicate(p)) return p;
    }
  }
  return null;
}

const findings = [];
function note(severity, area, text) {
  findings.push({ severity, area, text });
  console.error(`[${severity}] ${area}: ${text}`);
}

async function ensureChromeVisible(page) {
  await page.evaluate(() => {
    const v = document.querySelector('video');
    if (v && !v.paused) v.pause();
    document.querySelector('.ytp-autohide')?.classList.remove('ytp-autohide');
    document.querySelector('#movie_player')?.classList.add('ytp-mouse');
    const vid = document.querySelector('video');
    vid?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 400, clientY: 200 }));
  });
  await new Promise(r => setTimeout(r, 200));
}

async function setSliderPos(page, pos) {
  await page.evaluate(() => {
    const m = document.querySelector('.settings-menu');
    if (m && m.style.display === 'none') document.querySelector('.vs-gear-button')?.click();
  });
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate((p) => document.querySelector(`[data-vs-pos="${p}"]`)?.click(), pos);
  await new Promise(r => setTimeout(r, 600));
  // Close menu
  await page.evaluate(() => {
    const m = document.querySelector('.settings-menu');
    if (m && m.style.display !== 'none') document.querySelector('.vs-gear-button')?.click();
  });
  await new Promise(r => setTimeout(r, 200));
}

async function clickPanelGear(page) {
  await page.evaluate(() => {
    const gb = document.querySelector('.vs-gear-button');
    gb?.click();
  });
  await new Promise(r => setTimeout(r, 400));
}

async function selectTab(page, tab) {
  await page.evaluate((t) => {
    document.querySelector(`[data-vs-tab="${t}"]`)?.click();
  }, tab);
  await new Promise(r => setTimeout(r, 300));
}

async function panelMetrics(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.vs-panel');
    if (!panel) return { error: 'no panel' };
    const cs = getComputedStyle(panel);
    const allChildren = Array.from(panel.children).map(c => ({
      cls: c.className,
      rect: c.getBoundingClientRect(),
      visible: getComputedStyle(c).display !== 'none',
    }));
    return {
      panelDataPos: panel.dataset.vsSliderPosition,
      panelDataSite: panel.dataset.vsSite,
      panelDataTheme: document.documentElement.dataset.vsTheme,
      rect: panel.getBoundingClientRect(),
      display: cs.display,
      cssZIndex: cs.zIndex,
      computedColor: cs.color,
      children: allChildren,
      sliderInChrome: !!document.querySelector('.ytp-right-controls .speed-slider-container, [class*="desktopButtonsBlockRight"] .speed-slider-container, [class*="controlsBlockRight"] .speed-slider-container'),
      videoRate: document.querySelector('video')?.playbackRate ?? null,
      menuVisible: document.querySelector('.settings-menu')?.style?.display !== 'none',
      menuRect: document.querySelector('.settings-menu')?.getBoundingClientRect() ?? null,
      menuFlip: document.querySelector('.settings-menu')?.getAttribute('data-vs-flip') ?? null,
      activeTab: document.querySelector('[role="tab"][aria-selected="true"]')?.dataset?.vsTab,
      version: document.querySelector('.vs-menu-version')?.textContent?.trim(),
    };
  });
}

async function fullPanelShot(page, name) {
  const file = `${OUT_DIR}/${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.error('  -> saved', file);
}

async function cropPanelShot(page, name) {
  const box = await page.evaluate(() => {
    const panel = document.querySelector('.vs-panel');
    const menu = document.querySelector('.settings-menu');
    if (!panel) return null;
    const pr = panel.getBoundingClientRect();
    const mr = (menu && menu.style.display !== 'none') ? menu.getBoundingClientRect() : null;
    if (!mr) return { x: pr.x - 10, y: pr.y - 10, width: pr.width + 20, height: pr.height + 20 };
    // Encompass both
    const x = Math.min(pr.x, mr.x) - 5;
    const y = Math.min(pr.y, mr.y) - 5;
    const right = Math.max(pr.right, mr.right) + 5;
    const bottom = Math.max(pr.bottom, mr.bottom) + 5;
    return { x: Math.max(0, x), y: Math.max(0, y), width: right - Math.max(0, x), height: bottom - Math.max(0, y) };
  });
  if (!box) return;
  const file = `${OUT_DIR}/${name}.png`;
  await page.screenshot({ path: file, clip: box });
  console.error('  -> saved', file, JSON.stringify(box));
}

// =================== YOUTUBE ===================
const yt = findPage(p => p.url().includes('youtube.com'));
if (!yt) { console.error('no YT'); await browser.close(); process.exit(1); }

console.error('=== YOUTUBE ===');
console.error('Reload YT...');
await yt.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 5000));

// Test 1: default state (should be 'right' or whatever was last set)
await ensureChromeVisible(yt);
const ytInitial = await panelMetrics(yt);
console.log('--- YT initial:', JSON.stringify(ytInitial, null, 2));
if (!ytInitial.panelDataPos) note('FAIL', 'YT/init', 'panel not present after reload');

// Test 2: 'right' layout + open menu
console.error('\n-- right layout --');
await setSliderPos(yt, 'right');
await ensureChromeVisible(yt);
const ytRight = await panelMetrics(yt);
console.log(JSON.stringify(ytRight, null, 2));
await fullPanelShot(yt, 'yt-01-right-default');

await clickPanelGear(yt);
const ytRightMenu = await panelMetrics(yt);
console.log('with menu:', JSON.stringify({menuRect: ytRightMenu.menuRect, menuFlip: ytRightMenu.menuFlip, activeTab: ytRightMenu.activeTab}, null, 2));
await cropPanelShot(yt, 'yt-02-right-menu-general');

// Tab: hotkeys
await selectTab(yt, 'hotkeys');
await cropPanelShot(yt, 'yt-03-right-menu-hotkeys');
const ytHotkeysShot = await panelMetrics(yt);
console.log('hotkeys tab:', JSON.stringify({activeTab: ytHotkeysShot.activeTab}, null, 2));

// Tab: diagnostics
await selectTab(yt, 'diag');
await cropPanelShot(yt, 'yt-04-right-menu-diag');

// Click "Run check" (recheck)
await yt.evaluate(() => document.querySelector('[data-vs-diag="recheck"]')?.click());
await new Promise(r => setTimeout(r, 1000));
await cropPanelShot(yt, 'yt-05-right-menu-diag-after-recheck');

// Close menu
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
await new Promise(r => setTimeout(r, 200));

// Test 3: speed button click
console.error('\n-- speed button click --');
const ytBeforeClick = await yt.evaluate(() => document.querySelector('video')?.playbackRate);
await yt.evaluate(() => {
  const btns = document.querySelectorAll('.speed-button');
  // 1.5x is the default; click 2x to verify state change
  btns.forEach(b => { if (b.dataset.vsSpeed === '2') b.click(); });
});
await new Promise(r => setTimeout(r, 500));
const ytAfterClick = await yt.evaluate(() => ({
  rate: document.querySelector('video')?.playbackRate,
  active: Array.from(document.querySelectorAll('.speed-button.active')).map(b => b.dataset.vsSpeed),
  popupVisible: document.querySelector('#speed-popup')?.classList?.contains('show'),
}));
console.log('click 2x:', JSON.stringify({before: ytBeforeClick, after: ytAfterClick}, null, 2));
if (ytAfterClick.rate !== 2) note('FAIL', 'YT/speed', `2x click did not set rate=2 (got ${ytAfterClick.rate})`);
if (!ytAfterClick.active.includes('2')) note('FAIL', 'YT/speed', 'active class did not move to 2x button');

// Test 4: 'bottom' layout
console.error('\n-- bottom layout --');
await setSliderPos(yt, 'bottom');
await ensureChromeVisible(yt);
const ytBottom = await panelMetrics(yt);
console.log(JSON.stringify(ytBottom, null, 2));
await fullPanelShot(yt, 'yt-06-bottom-full');

await clickPanelGear(yt);
const ytBottomMenu = await panelMetrics(yt);
console.log('bottom + menu:', JSON.stringify({menuRect: ytBottomMenu.menuRect, menuFlip: ytBottomMenu.menuFlip}, null, 2));
await cropPanelShot(yt, 'yt-07-bottom-menu');

// Verify gear shares row with buttons (bottom)
if (ytBottom.children.length >= 3) {
  const buttons = ytBottom.children.find(c => c.cls.includes('speed-buttons-row'));
  const gear = ytBottom.children.find(c => c.cls.includes('vs-gear-wrapper'));
  const slider = ytBottom.children.find(c => c.cls.includes('speed-slider-container'));
  if (buttons && gear && Math.abs(buttons.rect.y - gear.rect.y) > 4) {
    note('FAIL', 'YT/bottom', `gear y=${gear.rect.y} != buttons y=${buttons.rect.y} (should share top row)`);
  }
  if (slider && buttons && slider.rect.y < buttons.rect.bottom - 4) {
    note('FAIL', 'YT/bottom', `slider y=${slider.rect.y} should be below buttons.bottom=${buttons.rect.bottom}`);
  }
}

// Close menu
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());

// Test 5: 'video' layout
console.error('\n-- video layout --');
await setSliderPos(yt, 'video');
await ensureChromeVisible(yt);
const ytVideo = await panelMetrics(yt);
console.log(JSON.stringify(ytVideo, null, 2));
if (!ytVideo.sliderInChrome) note('FAIL', 'YT/video', 'slider did NOT move into chrome on video pos');

// Crop just the chrome bar
const chromeBox = await yt.evaluate(() => {
  const c = document.querySelector('.ytp-right-controls');
  return c ? c.getBoundingClientRect() : null;
});
if (chromeBox) {
  await yt.screenshot({
    path: `${OUT_DIR}/yt-08-video-chrome-zoom.png`,
    clip: { x: Math.max(0, chromeBox.x - 5), y: chromeBox.y - 2, width: Math.min(1280, chromeBox.width + 10), height: chromeBox.height + 4 },
  });
}

// Verify slider+thumb+label all centered
const slLabelMetrics = await yt.evaluate(() => {
  const sc = document.querySelector('.speed-slider-container.vs-slider-in-chrome');
  if (!sc) return null;
  const slider = sc.querySelector('.speed-slider');
  const label = sc.querySelector('.speed-slider-label');
  return {
    container: sc.getBoundingClientRect(),
    slider: slider?.getBoundingClientRect(),
    label: label?.getBoundingClientRect(),
  };
});
if (slLabelMetrics) {
  const cMid = slLabelMetrics.container.y + slLabelMetrics.container.height / 2;
  const sMid = slLabelMetrics.slider.y + slLabelMetrics.slider.height / 2;
  const lMid = slLabelMetrics.label.y + slLabelMetrics.label.height / 2;
  console.log('chrome midpoints:', { cMid, sMid, lMid });
  if (Math.abs(sMid - cMid) > 2) note('FAIL', 'YT/video', `slider midpoint ${sMid} not centered to container ${cMid}`);
  if (Math.abs(lMid - cMid) > 2) note('FAIL', 'YT/video', `label midpoint ${lMid} not centered to container ${cMid}`);
}

// Test 6: settings menu off-screen flip on narrow viewport
console.error('\n-- narrow viewport menu flip --');
await setSliderPos(yt, 'right');
const oldVp = await yt.viewportSize();
console.log('current viewport:', oldVp);
// Simulate narrow viewport via emulate, but connectOverCDP doesn't allow setting viewport.
// Workaround: position the gear to a low x via DOM hack to trigger flip detection.
// Actually, just click gear and see whether flip activates on narrow real screen.
// We instead check the no-flip case is correct.
await clickPanelGear(yt);
const ytNoflipMenu = await panelMetrics(yt);
console.log('right + menu:', { menuFlip: ytNoflipMenu.menuFlip, menuLeft: ytNoflipMenu.menuRect?.left, menuRight: ytNoflipMenu.menuRect?.right });
if (ytNoflipMenu.menuRect && ytNoflipMenu.menuRect.left < 0) note('FAIL', 'YT/menu', 'menu off left edge without flip');

// Test 7: slider drag (programmatic via input event)
console.error('\n-- slider drag --');
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click()); // close menu
await new Promise(r => setTimeout(r, 200));
const ytSliderBefore = await yt.evaluate(() => document.querySelector('video')?.playbackRate);
await yt.evaluate(() => {
  const sl = document.querySelector('.speed-slider');
  if (sl) {
    sl.value = '1.25';
    sl.dispatchEvent(new Event('input', { bubbles: true }));
  }
});
await new Promise(r => setTimeout(r, 600));
const ytSliderAfter = await yt.evaluate(() => ({
  rate: document.querySelector('video')?.playbackRate,
  label: document.querySelector('.speed-slider-label')?.textContent,
}));
console.log('slider drag:', { before: ytSliderBefore, after: ytSliderAfter });
if (Math.abs((ytSliderAfter.rate ?? 0) - 1.25) > 0.01) note('FAIL', 'YT/slider', `drag did not set rate (got ${ytSliderAfter.rate})`);

// Final state for review
await fullPanelShot(yt, 'yt-09-final-state');

// =================== RUTUBE ===================
const rt = findPage(p => p.url().includes('rutube.ru'));
if (rt) {
  console.error('\n=== RUTUBE ===');
  console.error('Reload RuTube...');
  await rt.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 7000)); // RuTube is slower

  const rtInitial = await panelMetrics(rt);
  console.log('--- RT initial:', JSON.stringify(rtInitial, null, 2));
  if (!rtInitial.panelDataPos) note('WARN', 'RT/init', 'panel not present yet -- RuTube may need more time');

  await fullPanelShot(rt, 'rt-01-default');

  await clickPanelGear(rt);
  await cropPanelShot(rt, 'rt-02-menu-general');

  await selectTab(rt, 'diag');
  await cropPanelShot(rt, 'rt-03-menu-diag');
} else {
  note('WARN', 'RT', 'no rutube.ru tab open -- skipping RuTube portion');
}

// =================== SUMMARY ===================
console.log('\n=== AUDIT SUMMARY ===');
console.log(JSON.stringify({ findings, total: findings.length }, null, 2));
writeFileSync(`${OUT_DIR}/findings.json`, JSON.stringify(findings, null, 2));

await browser.close();
