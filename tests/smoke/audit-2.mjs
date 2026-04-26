import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const PORT = 9333;
const OUT = 'C:/Temp/vs-audit';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
function findPage(pred) {
  for (const c of browser.contexts()) for (const p of c.pages()) if (pred(p)) return p;
  return null;
}

const findings = [];
const F = (s, a, t) => { findings.push({ s, a, t }); console.error(`[${s}] ${a}: ${t}`); };

async function ensureChrome(p) {
  await p.evaluate(() => {
    const v = document.querySelector('video');
    if (v && !v.paused) v.pause();
    document.querySelector('.ytp-autohide')?.classList.remove('ytp-autohide');
    document.querySelector('#movie_player')?.classList.add('ytp-mouse');
    document.querySelector('video')?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 400, clientY: 200 }));
  });
  await new Promise(r => setTimeout(r, 200));
}

async function setPos(p, pos) {
  await p.evaluate(() => {
    const m = document.querySelector('.settings-menu');
    if (m && m.style.display === 'none') document.querySelector('.vs-gear-button')?.click();
  });
  await new Promise(r => setTimeout(r, 200));
  await p.evaluate((x) => document.querySelector(`[data-vs-pos="${x}"]`)?.click(), pos);
  await new Promise(r => setTimeout(r, 600));
  await p.evaluate(() => document.querySelector('.vs-gear-button')?.click()); // close
  await new Promise(r => setTimeout(r, 200));
}

async function shot(p, name, clip) {
  try {
    await p.screenshot({ path: `${OUT}/${name}.png`, clip, timeout: 5000 });
    console.error(`  -> ${name}.png`);
  } catch (e) {
    console.error(`  X failed ${name}: ${e.message}`);
  }
}

async function metrics(p) {
  return p.evaluate(() => {
    const panel = document.querySelector('.vs-panel');
    if (!panel) return { error: 'no panel' };
    return {
      pos: panel.dataset.vsSliderPosition,
      site: panel.dataset.vsSite,
      panelRect: panel.getBoundingClientRect(),
      kids: Array.from(panel.children).map(c => ({ cls: c.className, rect: c.getBoundingClientRect() })),
      sliderInChrome: !!document.querySelector('.ytp-right-controls .speed-slider-container, [class*="desktopButtonsBlockRight"] .speed-slider-container'),
      videoRate: document.querySelector('video')?.playbackRate ?? null,
      version: document.querySelector('.vs-menu-version')?.textContent?.trim(),
    };
  });
}

const yt = findPage(p => p.url().includes('youtube.com'));

console.error('=== YOUTUBE ===');
console.error('Reload YT...');
await yt.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 5000));
await ensureChrome(yt);

// 1) RIGHT layout
console.error('\n[1] right layout');
await setPos(yt, 'right');
await ensureChrome(yt);
const m1 = await metrics(yt);
console.log(JSON.stringify(m1, null, 2));
await shot(yt, '10-right-fullpage');
const panelBox = m1.panelRect;
await shot(yt, '11-right-panel-only', { x: Math.max(0, panelBox.x - 5), y: panelBox.y - 5, width: panelBox.width + 10, height: panelBox.height + 10 });

// 2) BOTTOM layout
console.error('\n[2] bottom layout');
await setPos(yt, 'bottom');
await ensureChrome(yt);
const m2 = await metrics(yt);
console.log(JSON.stringify(m2, null, 2));
const buttons2 = m2.kids.find(k => k.cls.includes('speed-buttons-row'));
const gear2 = m2.kids.find(k => k.cls.includes('vs-gear-wrapper'));
const slider2 = m2.kids.find(k => k.cls.includes('speed-slider-container'));
if (buttons2 && gear2 && Math.abs(buttons2.rect.y - gear2.rect.y) > 4) {
  F('FAIL', 'bottom', `gear y=${gear2.rect.y} != buttons y=${buttons2.rect.y}`);
}
if (slider2 && buttons2 && slider2.rect.y < buttons2.rect.bottom - 2) {
  F('FAIL', 'bottom', `slider should be below buttons`);
}
await shot(yt, '12-bottom-fullpage');
const pBox2 = m2.panelRect;
await shot(yt, '13-bottom-panel-only', { x: Math.max(0, pBox2.x - 5), y: pBox2.y - 5, width: pBox2.width + 10, height: pBox2.height + 10 });

// 3) VIDEO layout (slider in chrome)
console.error('\n[3] video layout');
await setPos(yt, 'video');
await ensureChrome(yt);
const m3 = await metrics(yt);
console.log(JSON.stringify(m3, null, 2));
if (!m3.sliderInChrome) F('FAIL', 'video', 'slider NOT in chrome');
const ytChromeBox = await yt.evaluate(() => document.querySelector('.ytp-chrome-bottom')?.getBoundingClientRect());
if (ytChromeBox) {
  await shot(yt, '14-video-chrome-zoom', { x: Math.max(0, ytChromeBox.x), y: ytChromeBox.y, width: ytChromeBox.width, height: ytChromeBox.height });
}
await shot(yt, '15-video-fullpage');

// Verify chrome midpoints
const mid = await yt.evaluate(() => {
  const sc = document.querySelector('.speed-slider-container.vs-slider-in-chrome');
  if (!sc) return null;
  const sl = sc.querySelector('.speed-slider').getBoundingClientRect();
  const lb = sc.querySelector('.speed-slider-label').getBoundingClientRect();
  const c = sc.getBoundingClientRect();
  return { cMid: c.y + c.height/2, sMid: sl.y + sl.height/2, lMid: lb.y + lb.height/2 };
});
if (mid) {
  console.log('chrome midpoints:', mid);
  if (Math.abs(mid.sMid - mid.cMid) > 2) F('FAIL', 'video', `slider mid ${mid.sMid} vs container mid ${mid.cMid}`);
  if (Math.abs(mid.lMid - mid.cMid) > 2) F('FAIL', 'video', `label mid ${mid.lMid} vs container mid ${mid.cMid}`);
}

// 4) SPEED BUTTON click — go back to right and test
console.error('\n[4] speed button click');
await setPos(yt, 'right');
const ratesBefore = await yt.evaluate(() => document.querySelector('video')?.playbackRate);
await yt.evaluate(() => {
  for (const b of document.querySelectorAll('.speed-button')) {
    if (b.dataset.vsSpeed === '2') b.click();
  }
});
await new Promise(r => setTimeout(r, 600));
const after = await yt.evaluate(() => ({
  rate: document.querySelector('video')?.playbackRate,
  active: Array.from(document.querySelectorAll('.speed-button.active')).map(b => b.dataset.vsSpeed),
  popup: document.querySelector('#speed-popup')?.classList?.contains('show'),
}));
console.log('click 2x:', { before: ratesBefore, after });
if (after.rate !== 2) F('FAIL', 'click', `rate stayed ${after.rate} after 2x click`);
if (!after.active.includes('2')) F('FAIL', 'click', `active button = ${after.active.join(',')}`);

// 5) SLIDER drag
console.error('\n[5] slider drag');
await yt.evaluate(() => {
  const sl = document.querySelector('.speed-slider');
  sl.value = '1.25';
  sl.dispatchEvent(new Event('input', { bubbles: true }));
});
await new Promise(r => setTimeout(r, 600));
const drag = await yt.evaluate(() => ({
  rate: document.querySelector('video')?.playbackRate,
  label: document.querySelector('.speed-slider-label')?.textContent,
}));
console.log('after drag:', drag);
if (Math.abs((drag.rate ?? 0) - 1.25) > 0.01) F('FAIL', 'drag', `rate=${drag.rate}`);
if (!drag.label?.includes('1.25')) F('FAIL', 'drag', `label=${drag.label}`);

// 6) Z-INDEX / overlap with site -- verify panel + menu z-index above key YT elements
console.error('\n[6] z-index / overlap');
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
await new Promise(r => setTimeout(r, 300));
const z = await yt.evaluate(() => {
  const panel = document.querySelector('.vs-panel');
  const menu = document.querySelector('.settings-menu');
  const cs = (el) => el ? getComputedStyle(el) : null;
  // Try to elementFromPoint at the menu center -- should be the menu (or its child)
  const mr = menu?.getBoundingClientRect();
  const top = mr ? document.elementFromPoint(mr.left + mr.width/2, mr.top + mr.height/2) : null;
  const topClasses = [];
  let n = top;
  while (n && topClasses.length < 5) { topClasses.push(n.tagName + '.' + (n.className||'').toString().slice(0,40)); n = n.parentElement; }
  return {
    panelZ: cs(panel)?.zIndex,
    menuZ: cs(menu)?.zIndex,
    menuTopChain: topClasses,
    menuVisible: menu?.style?.display !== 'none',
  };
});
console.log('z-index:', JSON.stringify(z, null, 2));
if (z.menuTopChain.length === 0 || !z.menuTopChain[0].includes('vs-')) {
  F('WARN', 'z-index', `top element at menu center: ${z.menuTopChain[0]}`);
}

// 7) Settings menu — verify it doesn't clip off-screen at narrow gear position
//   The gear is at the panel's right edge; menu anchored right:0 -> always within
//   panel range. Check clientWidth-aware overflow.
const overflow = await yt.evaluate(() => {
  const m = document.querySelector('.settings-menu');
  const r = m?.getBoundingClientRect();
  const vp = document.documentElement.clientWidth;
  return { vp, left: r?.left, right: r?.right, overflowsLeft: r?.left < 0, overflowsRight: r?.right > vp };
});
console.log('menu overflow:', overflow);
if (overflow.overflowsLeft) F('FAIL', 'menu', 'menu off LEFT edge');
if (overflow.overflowsRight) F('FAIL', 'menu', 'menu off RIGHT edge');
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());

// 8) RUTUBE
const rt = findPage(p => p.url().includes('rutube.ru'));
if (rt) {
  console.error('\n=== RUTUBE ===');
  await rt.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 8000));
  const rtm = await metrics(rt);
  console.log(JSON.stringify(rtm, null, 2));
  if (!rtm.pos) F('WARN', 'RT/init', 'panel not present after reload + 8s');
  await shot(rt, '20-rt-fullpage');
  if (rtm.panelRect) {
    await shot(rt, '21-rt-panel-only', { x: Math.max(0, rtm.panelRect.x - 5), y: rtm.panelRect.y - 5, width: rtm.panelRect.width + 10, height: rtm.panelRect.height + 10 });
  }
} else {
  F('WARN', 'RT', 'rutube.ru tab not found');
}

console.log('\n=== FINDINGS ===');
console.log(JSON.stringify(findings, null, 2));
writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 2));

await browser.close();
