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

  // Pause the video so chrome doesn't auto-hide
  await yt.evaluate(() => {
    const v = document.querySelector('video');
    if (v) v.pause();
  });
  await new Promise(r => setTimeout(r, 200));

  // Force chrome visible by removing autohide class + mouseover the player
  await yt.evaluate(() => {
    document.querySelector('.ytp-autohide')?.classList.remove('ytp-autohide');
    document.querySelector('#movie_player')?.classList.add('ytp-mouse');
    const v = document.querySelector('video');
    v?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 400, clientY: 200 }));
  });
  await new Promise(r => setTimeout(r, 300));

  // Crop screenshot to player area
  const playerBox = await yt.evaluate(() => {
    const p = document.querySelector('#movie_player');
    return p ? p.getBoundingClientRect() : null;
  });
  console.log('player box:', JSON.stringify(playerBox));

  await yt.screenshot({
    path: 'C:/Temp/vs-pos-video-zoom.png',
    clip: playerBox ? {
      x: Math.max(0, playerBox.x - 5),
      y: Math.max(0, playerBox.y + playerBox.height - 60),
      width: Math.min(1280, playerBox.width + 10),
      height: 60,
    } : undefined,
  });
  console.error('saved C:/Temp/vs-pos-video-zoom.png');

  // Also a wider crop
  await yt.screenshot({
    path: 'C:/Temp/vs-pos-video-wide.png',
    clip: playerBox ? {
      x: Math.max(0, playerBox.x - 5),
      y: Math.max(0, playerBox.y),
      width: Math.min(1280, playerBox.width + 10),
      height: playerBox.height + 5,
    } : undefined,
  });
  console.error('saved C:/Temp/vs-pos-video-wide.png');
} finally {
  await browser.close();
}
