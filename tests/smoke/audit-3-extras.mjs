import { chromium } from 'playwright';
const PORT = 9333;
const OUT = 'C:/Temp/vs-audit';
const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
function findPage(pred) {
  for (const c of browser.contexts()) for (const p of c.pages()) if (pred(p)) return p;
  return null;
}
async function snap(page, name, clip) {
  try {
    await page.screenshot({ path: `${OUT}/${name}.png`, clip, timeout: 20000, animations: 'disabled' });
    console.error('  -> ' + name);
  } catch (e) {
    // Fallback to full page screenshot if clipping fails
    await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 20000, animations: 'disabled' });
    console.error('  -> ' + name + ' (fullpage fallback: ' + e.message.slice(0, 80) + ')');
  }
}

const yt = findPage(p => p.url().includes('youtube.com'));

// Make sure video paused & chrome visible
async function forceChromeVisible(page) {
  await page.evaluate(() => {
    const v = document.querySelector('video');
    v?.pause();
    const player = document.querySelector('#movie_player');
    player?.classList.remove('ytp-autohide');
    player?.classList.add('ytp-mouse');
    document.querySelectorAll('.ytp-autohide').forEach(e => e.classList.remove('ytp-autohide'));
  });
  // Move mouse onto the player a couple of times to keep chrome out
  const box = await page.evaluate(() => document.querySelector('#movie_player')?.getBoundingClientRect());
  if (box) {
    await page.mouse.move(box.x + box.width/2, box.y + box.height - 30);
    await new Promise(r => setTimeout(r, 100));
    await page.mouse.move(box.x + box.width/2, box.y + box.height - 50);
  }
  await new Promise(r => setTimeout(r, 300));
}
await forceChromeVisible(yt);

// 1) VIDEO mode -- crop chrome bar
console.error('[1] video chrome zoom');
await yt.evaluate(() => {
  const m = document.querySelector('.settings-menu');
  if (m && m.style.display === 'none') document.querySelector('.vs-gear-button')?.click();
});
await new Promise(r => setTimeout(r, 200));
await yt.evaluate(() => document.querySelector('[data-vs-pos="video"]')?.click());
await new Promise(r => setTimeout(r, 600));
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click()); // close menu
await new Promise(r => setTimeout(r, 200));
await forceChromeVisible(yt);

const chromeBar = await yt.evaluate(() => {
  const c = document.querySelector('.ytp-chrome-bottom');
  return c ? c.getBoundingClientRect() : null;
});
console.log('chromeBar:', chromeBar);
if (chromeBar && chromeBar.height > 0) {
  await snap(yt, '14-video-chrome-zoom', { x: Math.max(0, chromeBar.x), y: chromeBar.y - 4, width: chromeBar.width, height: chromeBar.height + 4 });
} else {
  // Fallback: use slider bbox + a little margin
  const sb = await yt.evaluate(() => document.querySelector('.speed-slider-container.vs-slider-in-chrome')?.getBoundingClientRect());
  console.log('sliderBbox:', sb);
  if (sb) {
    await snap(yt, '14-video-chrome-zoom', { x: Math.max(0, sb.x - 250), y: sb.y - 10, width: 700, height: sb.height + 20 });
  }
}

// 2) BOTTOM mode + menu open, full-page zoom on the panel+menu
console.error('[2] bottom + menu');
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click());
await new Promise(r => setTimeout(r, 200));
await yt.evaluate(() => document.querySelector('[data-vs-pos="bottom"]')?.click());
await new Promise(r => setTimeout(r, 600));
const box = await yt.evaluate(() => {
  const p = document.querySelector('.vs-panel');
  const m = document.querySelector('.settings-menu');
  if (!p || !m) return null;
  const pr = p.getBoundingClientRect();
  const mr = m.getBoundingClientRect();
  const x = Math.min(pr.x, mr.x) - 5;
  const y = Math.min(pr.y, mr.y) - 5;
  const right = Math.max(pr.right, mr.right) + 5;
  const bottom = Math.max(pr.bottom, mr.bottom) + 5;
  return { x: Math.max(0, x), y, width: right - Math.max(0, x), height: bottom - y };
});
if (box) {
  await snap(yt, '12-bottom-with-menu', box);
}

// 3) Speed popup -- click 2x with menu closed
console.error('[3] speed popup on click');
await yt.evaluate(() => document.querySelector('.vs-gear-button')?.click()); // close menu
await new Promise(r => setTimeout(r, 200));
// Switch back to right so popup is over the player
await yt.evaluate(() => document.querySelector('[data-vs-pos="right"]')?.click());  // wait, menu closed
// Re-open + click pos right -- doh, keep video to keep popup over player
// Actually popup shows over the player regardless. Click 2x button now.
await new Promise(r => setTimeout(r, 200));
const playerBox = await yt.evaluate(() => document.querySelector('#movie_player')?.getBoundingClientRect());
await yt.evaluate(() => {
  for (const b of document.querySelectorAll('.speed-button')) {
    if (b.dataset.vsSpeed === '2.5') b.click();
  }
});
// Popup is shown for ~1.5s; capture quickly
await new Promise(r => setTimeout(r, 200));
if (playerBox) {
  await snap(yt, '16-speed-popup-on-click', { x: Math.max(0, playerBox.x), y: playerBox.y, width: playerBox.width, height: playerBox.height });
}

// 4) RuTube panel
console.error('[4] RuTube');
const rt = findPage(p => p.url().includes('rutube.ru'));
if (rt) {
  // ensure player is visible
  await rt.evaluate(() => document.querySelector('video')?.pause());
  const rb = await rt.evaluate(() => document.querySelector('.vs-panel')?.getBoundingClientRect());
  if (rb) {
    await snap(rt, '21-rt-panel-only', { x: Math.max(0, rb.x - 5), y: rb.y - 5, width: rb.width + 10, height: rb.height + 10 });
  }
  // Open menu on RT
  await rt.evaluate(() => {
    const m = document.querySelector('.settings-menu');
    if (m && m.style.display === 'none') document.querySelector('.vs-gear-button')?.click();
  });
  await new Promise(r => setTimeout(r, 400));
  const rtMenuBox = await rt.evaluate(() => {
    const p = document.querySelector('.vs-panel');
    const m = document.querySelector('.settings-menu');
    if (!p || !m) return null;
    const pr = p.getBoundingClientRect();
    const mr = m.getBoundingClientRect();
    const x = Math.min(pr.x, mr.x) - 5;
    const y = Math.min(pr.y, mr.y) - 5;
    const right = Math.max(pr.right, mr.right) + 5;
    const bottom = Math.max(pr.bottom, mr.bottom) + 5;
    return { x: Math.max(0, x), y, width: right - Math.max(0, x), height: bottom - y };
  });
  if (rtMenuBox) {
    await snap(rt, '22-rt-with-menu', rtMenuBox);
  }
  const rtMenuFlip = await rt.evaluate(() => document.querySelector('.settings-menu')?.getAttribute('data-vs-flip'));
  console.log('RT menu flip:', rtMenuFlip);
}

await browser.close();
