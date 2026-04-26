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
    // ytd-watch-metadata is the only reliable container for watch-page
    // metadata. The two #top-row variants cover both "modern" and
    // "classic" layouts; #above-the-fold is the deepest fallback.
    infoElem: [
      'ytd-watch-metadata #top-row',
      'div#top-row.style-scope.ytd-watch-metadata',
      'ytd-watch-metadata #above-the-fold',
    ],
    video: ['video.html5-main-video', 'video'],
    leftControls: [
      '.ytp-chrome-controls .ytp-left-controls',
      '.ytp-left-controls',
    ],
    rightControls: [
      '.ytp-right-controls',
      '.ytp-chrome-controls .ytp-right-controls',
    ],
    playerContainer: [
      '#player-container',
      '#movie_player',
      '.html5-video-container',
    ],
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
    controlsContainer: [
      '[class*="desktop-controls-layout-module__wrapper"]',
    ],
    leftControls: [
      '[class*="desktop-controls-layout-module__column"][class*="left"]',
    ],
    rightControls: [
      '[class*="desktop-controls-layout-module__column"][class*="right"]',
      '[class*="desktopButtonsBlockRight"]',
      '[class*="controlsBlockRight"]',
    ],
  },
};

export function selectorsFor(site: Site): SelectorMap {
  return SELECTORS[site];
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
};

export function substringFragmentsFor(site: Site, key: SelectorKey): readonly string[] {
  return SUBSTRING_FRAGMENTS[site]?.[key] ?? [];
}
