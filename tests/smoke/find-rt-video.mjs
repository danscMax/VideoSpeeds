// Find a real RT video URL by scraping the RT homepage, then verify the
// extension panel appears on it.
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP(`http://localhost:${process.env.VS_CDP_PORT ?? 9333}`);
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('rutube.ru')) ?? ctx.pages()[0];

await page.goto('https://rutube.ru/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
await page.waitForTimeout(5000);

// Pick the first /video/ link
const target = await page.evaluate(() => {
  const links = Array.from(document.querySelectorAll('a[href*="/video/"]'));
  for (const a of links) {
    const m = a.getAttribute('href')?.match(/^\/video\/([^/?#]+)\//);
    if (m) return `https://rutube.ru/video/${m[1]}/`;
  }
  return null;
});
console.log(`target: ${target}`);
if (!target) {
  console.log('no /video/ link found on homepage');
  await browser.close();
  process.exit(1);
}

await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
await page.waitForTimeout(8000);

const probe = await page.evaluate(() => {
  const panel = document.querySelector('.vs-panel');
  const layoutPlayer = document.querySelector('[class*="video-page-layout-module__player"]');
  const videos = Array.from(document.querySelectorAll('video')).map((v) => ({
    hasSrc: !!(v.currentSrc || v.src),
    width: Math.round(v.getBoundingClientRect().width),
    height: Math.round(v.getBoundingClientRect().height),
  }));
  return {
    pathname: location.pathname,
    title: document.title,
    panelExists: !!panel,
    panelParent: panel?.parentElement?.className?.toString()?.slice(0, 200),
    panelPrev: panel?.previousElementSibling?.tagName,
    layoutPlayer: !!layoutPlayer,
    layoutPlayerClass: layoutPlayer?.className?.slice(0, 100),
    videoCount: videos.length,
    videos,
  };
});
console.log(JSON.stringify(probe, null, 2));

await browser.close();
process.exit(probe.panelExists ? 0 : 1);
