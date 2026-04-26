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

  // Force video mode if not already
  await yt.evaluate(() => {
    const r = document.querySelector('[data-vs-pos="video"]');
    if (r && r.getAttribute('aria-pressed') !== 'true') r.click();
  });
  await new Promise(r => setTimeout(r, 800));

  const probe = await yt.evaluate(() => {
    const sc = document.querySelector('.speed-slider-container.vs-slider-in-chrome');
    if (!sc) return { error: 'slider not in chrome' };
    const rc = sc.parentElement;
    const cs = getComputedStyle(sc);
    const rcCs = getComputedStyle(rc);
    const slider = sc.querySelector('.speed-slider');
    const label = sc.querySelector('.speed-slider-label');
    return {
      // Container
      containerRect: sc.getBoundingClientRect(),
      containerCss: {
        display: cs.display,
        flexDirection: cs.flexDirection,
        alignItems: cs.alignItems,
        justifyContent: cs.justifyContent,
        height: cs.height,
        gap: cs.gap,
        padding: cs.padding,
        margin: cs.margin,
        alignSelf: cs.alignSelf,
      },
      containerChildren: Array.from(sc.children).map(c => ({
        tag: c.tagName,
        cls: c.className,
        rect: c.getBoundingClientRect(),
      })),
      // Parent (.ytp-right-controls)
      parentClassName: rc.className,
      parentRect: rc.getBoundingClientRect(),
      parentCss: {
        display: rcCs.display,
        flexDirection: rcCs.flexDirection,
        alignItems: rcCs.alignItems,
        height: rcCs.height,
      },
      // Children
      sliderRect: slider?.getBoundingClientRect(),
      labelRect: label?.getBoundingClientRect(),
      labelText: label?.textContent,
    };
  });
  console.log(JSON.stringify(probe, null, 2));
} finally {
  await browser.close();
}
