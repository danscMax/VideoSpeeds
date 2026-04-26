import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const PORT = 9333;
const OUT = 'C:/Temp/vs-audit';

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
function findPage(pred) {
  for (const c of browser.contexts()) for (const p of c.pages()) if (pred(p)) return p;
  return null;
}

const yt = findPage(p => p.url().includes('youtube.com'));
if (!yt) { console.error('no YT'); process.exit(1); }

// Use the underlying CDP session for raw screenshot -- bypass playwright's
// font/animation polling that hangs on this tab.
const cdp = await yt.context().newCDPSession(yt);

async function rawShot(name, x, y, w, h) {
  const r = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x, y, width: w, height: h, scale: 1 },
  });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
  console.error('  -> ' + name);
}
async function rawShotFull(name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
  console.error('  -> ' + name);
}

// Set right layout, take full snap
await yt.evaluate(() => {
  const m = document.querySelector('.settings-menu');
  if (m && m.style.display === 'none') document.querySelector('.vs-gear-button')?.click();
});
await new Promise(r => setTimeout(r, 200));
await yt.evaluate(() => document.querySelector('[data-vs-pos="right"]')?.click());
await new Promise(r => setTimeout(r, 600));
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
await new Promise(r => setTimeout(r, 200));
await rawShotFull('30-yt-right-fullpage-cdp');

// Open menu + capture
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
await new Promise(r => setTimeout(r, 300));
const box1 = await yt.evaluate(() => {
  const p = document.querySelector('.vs-panel');
  const m = document.querySelector('.settings-menu');
  if (!p || !m) return null;
  const pr = p.getBoundingClientRect();
  const mr = m.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(pr.x, mr.x) - 5),
    y: Math.min(pr.y, mr.y) - 5,
    w: Math.max(pr.right, mr.right) - Math.max(0, Math.min(pr.x, mr.x) - 5) + 5,
    h: Math.max(pr.bottom, mr.bottom) - Math.min(pr.y, mr.y) + 10,
  };
});
if (box1) await rawShot('31-yt-right-with-menu', box1.x, box1.y, box1.w, box1.h);
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click()); // close menu
await new Promise(r => setTimeout(r, 200));

// Bottom layout
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
await new Promise(r => setTimeout(r, 200));
await yt.evaluate(() => document.querySelector('[data-vs-pos="bottom"]')?.click());
await new Promise(r => setTimeout(r, 600));
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click()); // close
await new Promise(r => setTimeout(r, 200));
const bottBox = await yt.evaluate(() => {
  const p = document.querySelector('.vs-panel');
  if (!p) return null;
  const pr = p.getBoundingClientRect();
  return { x: Math.max(0, pr.x - 5), y: pr.y - 5, w: pr.width + 10, h: pr.height + 10 };
});
if (bottBox) await rawShot('32-yt-bottom-panel', bottBox.x, bottBox.y, bottBox.w, bottBox.h);

// Video layout
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
await new Promise(r => setTimeout(r, 200));
await yt.evaluate(() => document.querySelector('[data-vs-pos="video"]')?.click());
await new Promise(r => setTimeout(r, 800));
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
// force chrome visible
await yt.evaluate(() => {
  const v = document.querySelector('video');
  v?.pause();
  document.querySelector('#movie_player')?.classList.remove('ytp-autohide');
  document.querySelector('#movie_player')?.classList.add('ytp-mouse');
});
const playerBox = await yt.evaluate(() => document.querySelector('#movie_player')?.getBoundingClientRect());
if (playerBox) {
  // Bottom 60px of player = chrome controls
  await rawShot('33-yt-video-chrome', Math.max(0, playerBox.x), Math.max(0, playerBox.y + playerBox.height - 60), Math.min(1280, playerBox.width), 60);
}

// Click 2.5 button to trigger speed popup
await yt.evaluate(() => {
  for (const b of document.querySelectorAll('.speed-button')) {
    if (b.dataset.vsSpeed === '2.5') b.click();
  }
});
await new Promise(r => setTimeout(r, 100));
if (playerBox) {
  await rawShot('34-yt-speed-popup', Math.max(0, playerBox.x), Math.max(0, playerBox.y), Math.min(1280, playerBox.width), playerBox.height);
}

// RuTube
const rt = findPage(p => p.url().includes('rutube.ru'));
if (rt) {
  const rtCdp = await rt.context().newCDPSession(rt);
  async function rtShot(name, x, y, w, h) {
    const r = await rtCdp.send('Page.captureScreenshot', { format: 'png', clip: { x, y, width: w, height: h, scale: 1 } });
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
    console.error('  -> ' + name);
  }
  const rtFullSnap = async (name) => {
    const r = await rtCdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
    console.error('  -> ' + name);
  };
  await rtFullSnap('40-rt-fullpage-cdp');
  // Open menu
  await rt.evaluate(() => {
    const m = document.querySelector('.settings-menu');
    if (m && m.style.display === 'none') document.querySelector('.vs-gear-button')?.click();
  });
  await new Promise(r => setTimeout(r, 400));
  const rtBox = await rt.evaluate(() => {
    const p = document.querySelector('.vs-panel');
    const m = document.querySelector('.settings-menu');
    if (!p || !m) return null;
    const pr = p.getBoundingClientRect();
    const mr = m.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(pr.x, mr.x) - 5),
      y: Math.min(pr.y, mr.y) - 5,
      w: Math.max(pr.right, mr.right) - Math.max(0, Math.min(pr.x, mr.x) - 5) + 5,
      h: Math.max(pr.bottom, mr.bottom) - Math.min(pr.y, mr.y) + 10,
    };
  });
  if (rtBox) await rtShot('41-rt-with-menu', rtBox.x, rtBox.y, rtBox.w, rtBox.h);
}

await browser.close();
