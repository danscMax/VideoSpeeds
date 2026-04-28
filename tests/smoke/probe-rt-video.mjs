// Probe what's happening on RT /video/ page where the smoke test failed.
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP(`http://localhost:${process.env.VS_CDP_PORT ?? 9333}`);
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('rutube.ru')) ?? ctx.pages()[0];
console.log(`url: ${page.url()}`);

// Wait an extra long time and re-probe
await page.waitForTimeout(8000);

const probe = await page.evaluate(() => {
  const panel = document.querySelector('.vs-panel');
  const layoutPlayer = document.querySelector('[class*="video-page-layout-module__player"]');
  const sectionVideoPlayer = document.querySelector('section.video-player');
  const anyVideoPlayer = document.querySelector('[class*="video-player"]');
  const h1 = document.querySelector('h1');
  const videos = Array.from(document.querySelectorAll('video')).map((v) => ({
    hasSrc: !!(v.currentSrc || v.src),
    width: Math.round(v.getBoundingClientRect().width),
    height: Math.round(v.getBoundingClientRect().height),
    muted: v.muted,
    loop: v.loop,
  }));
  return {
    pathname: location.pathname,
    title: document.title,
    panelExists: !!panel,
    panelParent: panel?.parentElement?.tagName + '#' + (panel?.parentElement?.id || ''),
    layoutPlayer: !!layoutPlayer,
    sectionVideoPlayer: !!sectionVideoPlayer,
    anyVideoPlayer: !!anyVideoPlayer,
    h1Text: h1?.textContent?.slice(0, 100),
    videoCount: videos.length,
    videos,
  };
});
console.log(JSON.stringify(probe, null, 2));

await browser.close();
