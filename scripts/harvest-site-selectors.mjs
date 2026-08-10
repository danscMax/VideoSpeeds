#!/usr/bin/env node
/**
 * Harvest REAL selectors from a live video site, so adding a site is a
 * measurement instead of a guess.
 *
 *   node scripts/harvest-site-selectors.mjs [name]
 *
 * With no argument it walks every entry in TARGETS. For each one it opens the
 * listing page, follows the first real watch URL, waits for a <video>, and then
 * reports what src/discovery/selectors.ts actually needs:
 *
 *   - playerContainer : the ancestor chain of the biggest <video>, with the
 *                       ancestor that matches the video's box flagged
 *   - controlsContainer / rightControls : descendants of the player whose class
 *                       or aria role looks like a control bar, plus whether
 *                       they hold an interactive child (the `rightControls`
 *                       validator rejects clusters that do not)
 *   - infoElem        : title-ish blocks OUTSIDE the player, which is where the
 *                       panel is anchored
 *   - autohide        : control-bar classes sampled while the pointer is moving
 *                       and again after it goes idle — the diff is the class
 *                       the in-player slider must fade with
 *
 * Nothing here is asserted; it prints evidence for a human to turn into a
 * selector table. Run it again when a site redesigns.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = {
  vk: {
    listing: 'https://vkvideo.ru/',
    watchPattern: '/video-',
  },
  dzen: {
    listing: 'https://dzen.ru/video',
    watchPattern: '/video/watch/',
  },
  rutube: {
    listing: 'https://rutube.ru/',
    watchPattern: '/video/',
  },
};

const only = process.argv[2];

// --snippet prints a self-contained console one-liner instead of driving a
// browser. Some players (VK, measured 2026-08-10) refuse to create their
// <video> under ANY automated browser — headless Chromium, headed real Chrome,
// a persistent on-disk profile, and the official /video_ext.php embed all come
// back with zero <video> on a page that renders its title, view count and
// comments. Automation is not going to win that argument, and inventing the
// selectors instead is how a mock ends up encoding a fiction the product can
// never find on the real site. So: the human opens the page in their own
// browser, pastes this into DevTools, and hands back the same report the
// automated path produces.
if (process.argv.includes('--snippet')) {
  console.log(`Open the video in your normal browser, press F12 → Console, paste this, and
send back everything it prints:

copy((()=>{const v=[...document.querySelectorAll('video')].sort((a,b)=>{const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return y.width*y.height-x.width*x.height})[0];if(!v)return'NO VIDEO';const i=e=>e&&{tag:e.tagName.toLowerCase(),id:e.id||void 0,cls:(typeof e.className==='string'?e.className:'').slice(0,160),box:Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height)};const r=v.getBoundingClientRect();const anc=[];for(let n=v.parentElement,k=0;n&&k<10;n=n.parentElement,k++)anc.push({...i(n),sameBox:Math.abs(n.getBoundingClientRect().width-r.width)<8});const ov=b=>b.width>0&&b.left<r.right&&b.right>r.left&&b.top<r.bottom&&b.bottom>r.top;const ctl=[...document.querySelectorAll('*')].filter(e=>/control|panel|bottom|toolbar/i.test(typeof e.className==='string'?e.className:'')&&ov(e.getBoundingClientRect())).map(e=>({...i(e),btn:!!e.querySelector('button,[role=button],svg,[class*=Button]')})).filter(c=>parseInt(c.box)>120).slice(0,12);let rate;try{const p=v.playbackRate;v.playbackRate=1.25;rate=Math.abs(v.playbackRate-1.25)<0.01;v.playbackRate=p}catch(e){rate=String(e)}return JSON.stringify({url:location.href,canControlRate:rate,video:i(v),ancestors:anc,controls:ctl,titles:[...document.querySelectorAll('h1,[class*=title],[class*=Title]')].map(i).filter(t=>t.box!=='0x0').slice(0,6)},null,1)})())

It copies the report to your clipboard (the \`copy()\` at the front) and reads
nothing but the page's own layout — no accounts, no cookies, no network.`);
  process.exit(0);
}

const names = only ? [only] : Object.keys(TARGETS);

// Three launch modes, in increasing order of "looks like a person's browser".
// Reach for the later ones only when a site reports no <video> at all:
//   HEADED=1  — the installed Chrome instead of Playwright's bundled Chromium
//               (the bundled build ships without proprietary H.264/AAC, and
//               some players refuse to initialise headless).
//   PERSIST=1 — a real on-disk profile via launchPersistentContext, the same
//               shape the smoke harness uses. A fresh profile that survives the
//               run carries the storage and fingerprint a throwaway context
//               does not, which is what some players gate playback on.
const PROFILE = resolve(REPO, '.output/harvest-profile');
const persistent = !!process.env.PERSIST;
const ctx = persistent
  ? await chromium.launchPersistentContext(PROFILE, {
      headless: false,
      channel: 'chrome',
      viewport: { width: 1440, height: 900 },
    })
  : null;
const browser = persistent
  ? null
  : process.env.HEADED
    ? await chromium.launch({ headless: false, channel: 'chrome' })
    : await chromium.launch({ headless: true });

const newPage = async () =>
  ctx ? await ctx.newPage() : await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const name of names) {
  const target = TARGETS[name];
  if (!target) {
    console.error(`unknown target "${name}" — known: ${Object.keys(TARGETS).join(', ')}`);
    continue;
  }
  console.log(`\n${'='.repeat(70)}\n${name} — ${target.listing}\n${'='.repeat(70)}`);
  const page = await newPage();
  try {
    await page.goto(target.listing, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(4000);

    const watchUrl = await page.evaluate((pattern) => {
      const links = [...document.querySelectorAll('a[href]')].map((a) => a.href);
      return links.find((h) => h.includes(pattern)) ?? null;
    }, target.watchPattern);

    if (!watchUrl) {
      console.log(`  no link matching ${target.watchPattern} on the listing page`);
      await page.close();
      continue;
    }
    console.log(`  watch url: ${watchUrl}`);
    await page.goto(watchUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('video', { timeout: 30_000 }).catch(() => null);
    await page.waitForTimeout(5000);

    // Some players (VK) do not create the <video> element until playback is
    // actually requested, so a passive page load reports "no video" on a page
    // that plainly has one. Nudge it once, then look again.
    if (await page.evaluate(() => document.querySelector('video') == null)) {
      console.log('  no <video> yet — clicking the player to force it');
      await page
        .click('[class*="player"], [class*="Player"], video, [aria-label*="Play"], [aria-label*="оспроизв"]', {
          timeout: 5000,
        })
        .catch(() => null);
      await page.waitForSelector('video', { timeout: 20_000 }).catch(() => null);
      await page.waitForTimeout(4000);
    }

    const report = await page.evaluate(() => {
      const info = (el) => {
        if (!el) return null;
        const cls = typeof el.className === 'string' ? el.className : '';
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id || undefined,
          class: cls.slice(0, 160) || undefined,
          box: `${Math.round(r.width)}x${Math.round(r.height)}`,
        };
      };

      const videos = [...document.querySelectorAll('video')];
      if (!videos.length) {
        // Distinguish the three reasons a site can look video-less: the player
        // lives in an iframe (cross-origin means we cannot touch playbackRate
        // from the parent and the extension must run INSIDE the frame), the
        // page is a login wall, or the player is simply lazy.
        return {
          error: 'no <video> on the page',
          url: location.href,
          title: document.title,
          iframes: [...document.querySelectorAll('iframe')].map((f) => ({
            src: (f.getAttribute('src') || '').slice(0, 160),
            box: `${Math.round(f.getBoundingClientRect().width)}x${Math.round(f.getBoundingClientRect().height)}`,
          })),
          looksLikeLogin: /вход|log ?in|sign ?in|авториз/i.test(document.body.innerText.slice(0, 3000)),
          bodyStart: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300),
        };
      }
      const video = videos
        .slice()
        .sort((a, b) => {
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          return rb.width * rb.height - ra.width * ra.height;
        })[0];
      const vr = video.getBoundingClientRect();

      const ancestors = [];
      for (let n = video.parentElement, i = 0; n && i < 10; n = n.parentElement, i++) {
        const r = n.getBoundingClientRect();
        ancestors.push({
          ...info(n),
          /** True when this ancestor is the box the site fullscreens. */
          matchesVideoBox: Math.abs(r.width - vr.width) < 8 && Math.abs(r.height - vr.height) < 40,
        });
      }

      // Control-bar candidates found by GEOMETRY, not by DOM guessing: an
      // earlier version used video.closest('[class*="player"]'), which on Dzen
      // matched the <video> itself (its own class contains "player") and so
      // searched an empty subtree and reported "no controls" on a page that
      // plainly has them. Overlapping the video's box is the honest test.
      const overlapsVideo = (r) =>
        r.width > 0 && r.height > 0 && r.left < vr.right && r.right > vr.left && r.top < vr.bottom && r.bottom > vr.top;
      const controlish = [...document.querySelectorAll('*')]
        .filter((el) => {
          const cls = typeof el.className === 'string' ? el.className.toLowerCase() : '';
          if (!/control|panel|bottom|toolbar/.test(cls)) return false;
          return overlapsVideo(el.getBoundingClientRect());
        })
        .map((el) => ({
          ...info(el),
          width: Math.round(el.getBoundingClientRect().width),
          hasInteractive: !!el.querySelector('button, [role="button"], svg, [class*="Button"]'),
        }))
        .filter((c) => c.width > 120)
        .slice(0, 14);

      const titles = [...document.querySelectorAll('h1, [class*="title"], [class*="Title"]')]
        .map(info)
        .filter((t) => t.box !== '0x0')
        .slice(0, 8);

      return {
        url: location.href,
        videoCount: videos.length,
        video: info(video),
        canControlRate: (() => {
          try {
            const before = video.playbackRate;
            video.playbackRate = 1.25;
            const ok = Math.abs(video.playbackRate - 1.25) < 0.01;
            video.playbackRate = before;
            return ok;
          } catch (e) {
            return `threw: ${String(e)}`;
          }
        })(),
        playerAncestors: ancestors,
        controlCandidates: controlish,
        titleCandidates: titles,
      };
    });

    console.log(JSON.stringify(report, null, 2));

    // Autohide probe: sample the control-bar classes with the pointer moving,
    // then again after it has been still. Whatever class appears only in the
    // idle sample is what the in-player slider has to fade with.
    const autohide = await page.evaluate(async () => {
      const video = document.querySelector('video');
      if (!video) return null;
      const vr = video.getBoundingClientRect();
      const player = video.parentElement;
      const bars = [...document.querySelectorAll('*')].filter((el) => {
        const cls = typeof el.className === 'string' ? el.className.toLowerCase() : '';
        if (!/control/.test(cls)) return false;
        const r = el.getBoundingClientRect();
        return r.width > 200 && r.left < vr.right && r.right > vr.left && r.top < vr.bottom && r.bottom > vr.top;
      });
      const snap = () =>
        bars.map((el) => ({
          class: typeof el.className === 'string' ? el.className.slice(0, 120) : '',
          opacity: getComputedStyle(el).opacity,
          display: getComputedStyle(el).display,
        }));
      player.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      const active = snap();
      await new Promise((r) => setTimeout(r, 5000));
      return { active, idle: snap(), playerClass: player.className.slice(0, 160) };
    });
    console.log('autohide probe:', JSON.stringify(autohide, null, 2));
  } catch (e) {
    console.error(`  ${name} failed: ${String(e).split('\n')[0]}`);
  }
  await page.close();
}
await (ctx ?? browser).close();
