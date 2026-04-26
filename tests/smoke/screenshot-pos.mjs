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

  // Make sure player is visible -- move mouse over it so .ytp-right-controls
  // is not auto-hidden in the screenshot.
  await yt.mouse.move(640, 360);
  await new Promise(r => setTimeout(r, 300));
  await yt.screenshot({ path: 'C:/Temp/vs-pos-current.png', fullPage: false });
  console.log('saved C:/Temp/vs-pos-current.png');
} finally {
  await browser.close();
}
