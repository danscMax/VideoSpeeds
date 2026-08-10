/**
 * Per-site CSS selector tables.
 *
 * Ordered: most-specific / most-stable first; fallbacks last. The engine's
 * "exact" strategy walks the array in order. Substring fragments are used
 * by the "substring" strategy as a hashed-CSS-Modules-resistant retry.
 *
 * Ported from .user.js:902-966 + .user.js:1245-1258 with HDRezka entries
 * dropped (not in product scope).
 */

import type { Site } from '../app/ports';
import type { SelectorKey } from './types';

export type SelectorMap = Partial<Record<SelectorKey, readonly string[]>>;

const SELECTORS: Record<Site, SelectorMap> = {
  youtube: {
    // ytd-watch-metadata as the WHOLE element (not its #top-row child).
    // We then insert the panel as a SIBLING just before it, inside
    // #primary -- OUTSIDE Polymer's component tree. This blocks YT's
    // delegated click handlers (e.g. the action-row "Save to playlist"
    // delegate) from reinterpreting our gear-button clicks as their own.
    // Fallbacks point at #top-row variants for layout regressions where
    // ytd-watch-metadata stops matching.
    infoElem: [
      'ytd-watch-metadata',
      'ytd-watch-metadata #top-row',
      'div#top-row.style-scope.ytd-watch-metadata',
      'ytd-watch-metadata #above-the-fold',
    ],
    video: ['video.html5-main-video', 'video'],
    leftControls: ['.ytp-chrome-controls .ytp-left-controls', '.ytp-left-controls'],
    rightControls: ['.ytp-right-controls', '.ytp-chrome-controls .ytp-right-controls'],
    playerContainer: ['#player-container', '#movie_player', '.html5-video-container'],
  },
  rutube: {
    infoElem: [
      '[class*="videoTitleSection"]',
      '[class*="pageInfoContainerWrapper"]',
      '[class*="wdp-videopage-description-module__wrapper"]',
      'h1',
    ],
    video: ['video'],
    playerContainer: [
      // Outer layout-section MUST come first. Its parent is
      // video-page-layout-module__left, where the player and the title
      // block live as siblings -- inserting after layout-section lands
      // between player and title. If we matched section.video-player
      // first, its parent is an anonymous DIV INSIDE layout-section
      // and our UI would overlay the player's own buttons.
      '[class*="video-page-layout-module__player"]',
      'section.video-player',
      '[class*="video-player"]',
    ],
    controlsContainer: ['[class*="desktop-controls-layout-module__wrapper"]'],
    leftControls: ['[class*="desktop-controls-layout-module__column"][class*="left"]'],
    // Measured on live rutube.ru 2026-08-10, and the measurement corrected the
    // list: the right-hand cluster carries NO "right" anywhere in its class
    // attribute. The bar is a flex column of rows; the left cluster is tagged
    // `__left___`, but its counterpart is identified only by the utility class
    // `_justify-flex-end_`. The three entries that used to lead this list
    // ([class*="…column"][class*="right"], desktopButtonsBlockRight,
    // controlsBlockRight) matched nothing on the current site — grep for
    // "right" over the whole player subtree returns zero hits. They stay as
    // trailing fallbacks for older builds, but they must not lead, or the
    // slider silently falls back to the whole wrapper.
    rightControls: [
      '[class*="desktop-controls-layout-module__column"][class*="justify-flex-end"]',
      '[class*="desktop-controls-layout-module__column"][class*="right"]',
      '[class*="desktopButtonsBlockRight"]',
      '[class*="controlsBlockRight"]',
    ],
  },
  // Dzen video (dzen.ru/video/watch/…). Every selector here was measured on a
  // live page with scripts/harvest-site-selectors.mjs on 2026-08-10, not
  // guessed. Two properties of this site shape the list:
  //
  //   1. Class names are hashed CSS-Modules with a per-build suffix
  //      (`__player-1k`, `__videoControls-3i`). Only the stable module prefix
  //      may be matched, so every entry is a substring match — an exact class
  //      would survive exactly one Yandex deploy.
  //   2. The whole page is a viewer overlay: the title sits ON the video
  //      rather than under it, so the panel anchors to the content column
  //      below the player instead of to a metadata block.
  dzen: {
    video: ['video.zen-ui-video-video-player__player', 'video'],
    playerContainer: [
      // Outer wrapper first: it is the element the site fullscreens, and its
      // parent is the content column where the panel goes as a sibling.
      '[class*="video-viewer--video-viewer-player__playerWrap"]',
      '[class*="video-viewer--video-player__videoPlayer"]',
      '[class*="video-viewer--video-player__player"]',
    ],
    infoElem: [
      '[class*="video-viewer--video-viewer-content__wrapper"]',
      '[class*="video-viewer--viewer-layout__content"]',
    ],
    controlsContainer: ['[class*="video-viewer--video-controls__videoControls"]'],
    // The bottom row of the overlay — the one that actually holds buttons.
    // `cover__bottom` is Dzen's own name for it; pairing it with the controls
    // module keeps it from matching the other three full-bleed cover layers,
    // which carry no interactive children and would fail the validator anyway.
    rightControls: [
      '[class*="video-viewer--cover__item"][class*="video-viewer--cover__bottom"]',
      '[class*="video-viewer--video-controls__composer"]',
    ],
  },
};

export function selectorsFor(site: Site): SelectorMap {
  return SELECTORS[site];
}

/**
 * Can this site host the slider inside the player's own control bar
 * (`sliderPosition: 'video'`)? True when there is somewhere to mount it —
 * which is exactly what panel.applyLayout() looks up before it moves the
 * slider, so the settings menu and the layout agree by construction.
 *
 * This used to be a literal `site === 'youtube'` in the settings modal. That
 * hid the option on RuTube even though its control-bar selectors had been in
 * this table all along, and it would silently hide it again for every site
 * added later. Derive it, don't re-type it per site.
 */
export function supportsInPlayerSlider(site: Site): boolean {
  const map = SELECTORS[site];
  return (map.rightControls?.length ?? 0) > 0 || (map.controlsContainer?.length ?? 0) > 0;
}

/**
 * Substring fragments used by the "substring" strategy. Pulls stable
 * CSS-Modules prefixes out of the full hashed class names so React/Vue
 * sites that hash classes per-build can still be matched after the
 * exact-selector list goes stale.
 */
const SUBSTRING_FRAGMENTS: Record<Site, Partial<Record<SelectorKey, readonly string[]>>> = {
  youtube: {
    playerContainer: ['html5-video-container', 'movie_player'],
    infoElem: ['ytd-watch-metadata'],
  },
  rutube: {
    playerContainer: ['video-player', 'video-page-layout-module__player'],
    infoElem: [
      'videoTitleSection',
      'pageInfoContainerWrapper',
      'wdp-videopage-description-module__wrapper',
    ],
  },
  // Dzen hashes EVERY class per build, so the substring strategy is not a
  // fallback here — it is the only thing that keeps working after a deploy.
  dzen: {
    playerContainer: [
      'video-viewer--video-viewer-player__playerWrap',
      'video-viewer--video-player__videoPlayer',
    ],
    infoElem: [
      'video-viewer--video-viewer-content__wrapper',
      'video-viewer--viewer-layout__content',
    ],
  },
};

export function substringFragmentsFor(site: Site, key: SelectorKey): readonly string[] {
  return SUBSTRING_FRAGMENTS[site]?.[key] ?? [];
}
