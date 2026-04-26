// Quick audit on already-loaded page. No reload, no extension reload.
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

async function shot(cdp, name, clip) {
  try {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
    console.error('  -> ' + name);
  } catch (e) { console.error('  X ' + name + ': ' + e.message.slice(0, 100)); }
}

const yt = findPage(p => p.url().includes('youtube.com'));
if (!yt) { console.error('no YT'); await browser.close(); process.exit(1); }
const ytCdp = await yt.context().newCDPSession(yt);

// Reload page (not extension) to clear stale state
console.error('reload YT...');
await yt.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 6000));

const initial = await yt.evaluate(() => ({
  pos: document.querySelector('.vs-panel')?.dataset?.vsSliderPosition,
  hasPanel: !!document.querySelector('.vs-panel'),
  videoRate: document.querySelector('video')?.playbackRate,
}));
console.log('initial:', initial);

async function setPos(pos) {
  await yt.evaluate(() => {
    const m = document.querySelector('.settings-menu');
    if (m && m.style.display === 'none') document.querySelector('.vs-gear-button')?.click();
  });
  await new Promise(r => setTimeout(r, 300));
  await yt.evaluate((x) => document.querySelector(`[data-vs-pos="${x}"]`)?.click(), pos);
  await new Promise(r => setTimeout(r, 800));
  await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
  await new Promise(r => setTimeout(r, 200));
}

async function panelBoxFor() {
  const r = await yt.evaluate(() => document.querySelector('.vs-panel')?.getBoundingClientRect());
  if (!r) return null;
  return { x: Math.max(0, r.x - 5), y: Math.max(0, r.y - 5), width: r.width + 10, height: r.height + 10 };
}

// === RIGHT ===
console.error('[1] right');
await setPos('right');
const v = await yt.evaluate(() => document.querySelector('.vs-menu-version')?.textContent?.trim() || (document.querySelector('.vs-gear-button')?.click(), document.querySelector('.vs-menu-version')?.textContent?.trim()));
console.log('version probe:', v);
const b1 = await panelBoxFor();
if (b1) await shot(ytCdp, '01-right-panel', b1);

// open menu and snap
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
await new Promise(r => setTimeout(r, 400));
const ver = await yt.evaluate(() => document.querySelector('.vs-menu-version')?.textContent?.trim());
console.log('version:', ver);
const m1 = await yt.evaluate(() => {
  const p = document.querySelector('.vs-panel');
  const m = document.querySelector('.settings-menu');
  if (!p || !m) return null;
  const pr = p.getBoundingClientRect(), mr = m.getBoundingClientRect();
  const x = Math.max(0, Math.min(pr.x, mr.x) - 5);
  const y = Math.max(0, Math.min(pr.y, mr.y) - 5);
  return { x, y, width: Math.max(pr.right, mr.right) - x + 5, height: Math.max(pr.bottom, mr.bottom) - y + 10 };
});
if (m1) await shot(ytCdp, '02-right-menu-general', m1);

// hotkeys
await yt.evaluate(() => document.querySelector('[data-vs-tab="hotkeys"]')?.click());
await new Promise(r => setTimeout(r, 300));
if (m1) await shot(ytCdp, '03-right-menu-hotkeys', m1);

// diag (no recheck button click, just see initial state)
await yt.evaluate(() => document.querySelector('[data-vs-tab="diag"]')?.click());
await new Promise(r => setTimeout(r, 600));
if (m1) await shot(ytCdp, '04-right-menu-diag-initial', m1);

// click recheck and snap
console.error('[2] click recheck');
await yt.evaluate(() => document.querySelector('[data-vs-diag="recheck"]')?.click());
await new Promise(r => setTimeout(r, 1500));
if (m1) await shot(ytCdp, '05-right-menu-diag-after-recheck', m1);
const diagAfter = await yt.evaluate(() => ({
  state: document.querySelector('[data-vs-diag-status]')?.dataset?.state,
  headline: document.querySelector('[data-vs-diag-headline]')?.textContent,
  detail: document.querySelector('[data-vs-diag-detail]')?.textContent,
}));
console.log('diag after recheck:', diagAfter);

// close menu
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
await new Promise(r => setTimeout(r, 200));

// === BOTTOM ===
console.error('[3] bottom');
await setPos('bottom');
const b2 = await panelBoxFor();
if (b2) await shot(ytCdp, '06-bottom-panel', b2);

// === VIDEO ===
console.error('[4] video');
await setPos('video');
await yt.evaluate(() => {
  document.querySelector('video')?.pause();
  document.querySelector('#movie_player')?.classList.remove('ytp-autohide');
});
const player = await yt.evaluate(() => document.querySelector('#movie_player')?.getBoundingClientRect());
if (player) await shot(ytCdp, '07-video-chrome', { x: Math.max(0, player.x), y: Math.max(0, player.y + player.height - 64), width: Math.min(1280, player.width), height: 64 });

// === SLIDER DRAG (post-fix) ===
console.error('[5] drag test post-fix');
await setPos('right');
// Set initial via 1.5x button
await yt.evaluate(() => { for (const b of document.querySelectorAll('.speed-button')) if (b.dataset.vsSpeed === '1.5') b.click(); });
await new Promise(r => setTimeout(r, 700));
const beforeDrag = await yt.evaluate(() => document.querySelector('video')?.playbackRate);
await yt.evaluate(() => {
  const sl = document.querySelector('.speed-slider');
  sl.value = '1.25';
  sl.dispatchEvent(new Event('input', { bubbles: true }));
});
await new Promise(r => setTimeout(r, 1500));
const afterDrag = await yt.evaluate(() => ({
  rate: document.querySelector('video')?.playbackRate,
  label: document.querySelector('.speed-slider-label')?.textContent,
}));
console.log('drag 1.5->1.25:', { before: beforeDrag, after: afterDrag });
if (Math.abs((afterDrag.rate ?? 0) - 1.25) > 0.01) F('FAIL', 'drag', `rate stayed ${afterDrag.rate}`);

// === RUTUBE ===
console.error('[6] RuTube');
const rt = findPage(p => p.url().includes('rutube.ru'));
if (rt) {
  const rtCdp = await rt.context().newCDPSession(rt);
  const rtState = await rt.evaluate(() => {
    const p = document.querySelector('.vs-panel');
    return p ? { pos: p.dataset.vsSliderPosition, rect: p.getBoundingClientRect(), kids: Array.from(p.children).map(c => ({cls: c.className, rect: c.getBoundingClientRect()})) } : null;
  });
  console.log('RT state:', JSON.stringify(rtState, null, 2));
  if (!rtState) F('WARN', 'RT', 'no panel');
  await shot(rtCdp, '08-rt-fullpage');
  if (rtState?.rect) await shot(rtCdp, '09-rt-panel', { x: Math.max(0, rtState.rect.x - 5), y: Math.max(0, rtState.rect.y - 5), width: rtState.rect.width + 10, height: rtState.rect.height + 10 });
}

console.log('\n=== FINDINGS ===');
console.log(JSON.stringify(findings, null, 2));
writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 2));
await browser.close();
