import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
const PORT = 9333;
const OUT = 'C:/Temp/vs-audit-2';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
function findPage(pred) {
  for (const c of browser.contexts()) for (const p of c.pages()) if (pred(p)) return p;
  return null;
}
const findings = [];
const F = (s, a, t) => { findings.push({ s, a, t }); console.error(`[${s}] ${a}: ${t}`); };

async function rawShot(cdp, name, clip) {
  try {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
    console.error('  -> ' + name);
  } catch (e) { console.error('  X ' + name + ': ' + e.message.slice(0, 100)); }
}

const yt = findPage(p => p.url().includes('youtube.com'));
if (!yt) { console.error('no YT'); await browser.close(); process.exit(1); }
const ytCdp = await yt.context().newCDPSession(yt);

console.error('=== YT ===');
await yt.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 5000));

async function setPos(p, pos) {
  await p.evaluate(() => {
    const m = document.querySelector('.settings-menu');
    if (m && m.style.display === 'none') document.querySelector('.vs-gear-button')?.click();
  });
  await new Promise(r => setTimeout(r, 300));
  await p.evaluate((x) => document.querySelector(`[data-vs-pos="${x}"]`)?.click(), pos);
  await new Promise(r => setTimeout(r, 800));
  await p.evaluate(() => document.querySelector('.vs-gear-button')?.click());
  await new Promise(r => setTimeout(r, 200));
}

console.error('[1] right layout');
await setPos(yt, 'right');
const r1 = await yt.evaluate(() => ({ pos: document.querySelector('.vs-panel')?.dataset?.vsSliderPosition, version: document.querySelector('.vs-menu-version')?.textContent?.trim() }));
console.log(r1);
await rawShot(ytCdp, '01-right-fullpage');
const pBox = await yt.evaluate(() => document.querySelector('.vs-panel')?.getBoundingClientRect());
if (pBox) await rawShot(ytCdp, '02-right-panel', { x: Math.max(0, pBox.x - 5), y: Math.max(0, pBox.y - 5), width: pBox.width + 10, height: pBox.height + 10 });

await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
await new Promise(r => setTimeout(r, 400));
const mBox = await yt.evaluate(() => {
  const p = document.querySelector('.vs-panel');
  const m = document.querySelector('.settings-menu');
  if (!p || !m) return null;
  const pr = p.getBoundingClientRect(), mr = m.getBoundingClientRect();
  return { x: Math.max(0, Math.min(pr.x, mr.x) - 5), y: Math.min(pr.y, mr.y) - 5,
           w: Math.max(pr.right, mr.right) - Math.max(0, Math.min(pr.x, mr.x) - 5) + 5,
           h: Math.max(pr.bottom, mr.bottom) - Math.min(pr.y, mr.y) + 10 };
});
if (mBox) await rawShot(ytCdp, '03-right-menu-general', { x: mBox.x, y: mBox.y, width: mBox.w, height: mBox.h });
await yt.evaluate(() => document.querySelector('[data-vs-tab="hotkeys"]')?.click());
await new Promise(r => setTimeout(r, 300));
if (mBox) await rawShot(ytCdp, '04-right-menu-hotkeys', { x: mBox.x, y: mBox.y, width: mBox.w, height: mBox.h });
await yt.evaluate(() => document.querySelector('[data-vs-tab="diag"]')?.click());
await new Promise(r => setTimeout(r, 500));
if (mBox) await rawShot(ytCdp, '05-right-menu-diag', { x: mBox.x, y: mBox.y, width: mBox.w, height: mBox.h });
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
await new Promise(r => setTimeout(r, 200));

console.error('[2] bottom layout');
await setPos(yt, 'bottom');
const pBox2 = await yt.evaluate(() => document.querySelector('.vs-panel')?.getBoundingClientRect());
if (pBox2) await rawShot(ytCdp, '06-bottom-panel', { x: Math.max(0, pBox2.x - 5), y: Math.max(0, pBox2.y - 5), width: pBox2.width + 10, height: pBox2.height + 10 });

console.error('[3] video layout');
await setPos(yt, 'video');
await yt.evaluate(() => {
  document.querySelector('video')?.pause();
  document.querySelector('#movie_player')?.classList.remove('ytp-autohide');
});
const playerBox = await yt.evaluate(() => document.querySelector('#movie_player')?.getBoundingClientRect());
if (playerBox) await rawShot(ytCdp, '07-video-chrome', { x: Math.max(0, playerBox.x), y: Math.max(0, playerBox.y + playerBox.height - 64), width: Math.min(1280, playerBox.width), height: 64 });

console.error('[4] slider drag');
await setPos(yt, 'right');
await yt.evaluate(() => { for (const b of document.querySelectorAll('.speed-button')) if (b.dataset.vsSpeed === '1.5') b.click(); });
await new Promise(r => setTimeout(r, 600));
const dragBefore = await yt.evaluate(() => document.querySelector('video')?.playbackRate);
await yt.evaluate(() => {
  const sl = document.querySelector('.speed-slider');
  sl.value = '1.25';
  sl.dispatchEvent(new Event('input', { bubbles: true }));
});
await new Promise(r => setTimeout(r, 1500));
const dragAfter = await yt.evaluate(() => ({
  rate: document.querySelector('video')?.playbackRate,
  label: document.querySelector('.speed-slider-label')?.textContent,
  active: Array.from(document.querySelectorAll('.speed-button.active')).map(b => b.dataset.vsSpeed),
}));
console.log('drag 1.5->1.25:', { before: dragBefore, after: dragAfter });
if (Math.abs((dragAfter.rate ?? 0) - 1.25) > 0.01) F('FAIL', 'drag', `rate=${dragAfter.rate}`);

console.error('[5] RuTube');
const rt = findPage(p => p.url().includes('rutube.ru'));
if (rt) {
  const rtCdp = await rt.context().newCDPSession(rt);
  const rtm = await rt.evaluate(() => {
    const p = document.querySelector('.vs-panel');
    return p ? { pos: p.dataset.vsSliderPosition, rect: p.getBoundingClientRect() } : null;
  });
  console.log('RT:', rtm);
  if (!rtm) F('WARN', 'RT', 'no panel');
  await rawShot(rtCdp, '08-rt-fullpage');
  if (rtm?.rect) await rawShot(rtCdp, '09-rt-panel', { x: Math.max(0, rtm.rect.x - 5), y: Math.max(0, rtm.rect.y - 5), width: rtm.rect.width + 10, height: rtm.rect.height + 10 });
}

console.log('\n=== FINDINGS ===');
console.log(JSON.stringify(findings, null, 2));
writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 2));
await browser.close();
