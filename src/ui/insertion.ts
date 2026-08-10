/**
 * Decide WHERE the panel lands in the page DOM.
 *
 * The `sliderPosition` setting picks one of three behaviors:
 *   - 'right'   -> insert as a SIBLING right after the player container
 *                  (under the video, full-width above the title block).
 *                  Always-visible, doesn't fight native player chrome.
 *   - 'bottom'  -> same anchor as 'right' for now; CSS controls the
 *                  internal layout (slider beside vs below the buttons).
 *   - 'video'   -> YouTube only: embed into the player chrome's bottom
 *                  controls bar. Overlay style, visible only on hover.
 *
 * Why we no longer body-fallback (audit-driven 2026-04-26):
 *   - Earlier the panel would land at the bottom of <body> when no
 *     player was found yet; on RuTube that was 9000+ pixels below the
 *     fold, invisible to the user.
 *   - Now we refuse to insert until a real anchor is available. The
 *     orchestrator's SPA-navigation listener reattaches when the player
 *     finally appears.
 *
 * Why we insert as a SIBLING of the player and not INSIDE it (also
 * audit-driven):
 *   - Inserting into the player container made the panel overlap the
 *     <video> element. On YouTube the previous attempt added it to
 *     `.ytp-right-controls` which is part of the chrome overlay, so
 *     the panel was hidden until the user moused over the video.
 *   - The reference userscript inserts the panel as a sibling of the
 *     player, BEFORE the watch-metadata block. We follow the same
 *     pattern.
 */

import type { AppContext } from '../app/context';
import { isVkVideoPath } from '../sites/detect';
import type { SliderPosition } from '../storage/types';

export type InsertionAnchor =
  | 'before-info' // sibling of infoElem (preferred -- always visible)
  | 'after-player' // sibling right after player container
  | 'video-overlay' // inside player chrome (YT 'video' position only)
  | 'no-anchor'; // could not find a valid spot; defer

export interface InsertionResult {
  parent: Element | null;
  anchor: InsertionAnchor;
  /**
   * True when the anchor we picked is a *fallback* and a more-preferred
   * anchor may still appear once YT/RT finishes hydrating. The orchestrator
   * (`tryOnce` in src/index.ts) keeps the retry loop alive on tentative
   * results so we move the panel to its proper home as soon as the
   * preferred anchor is available.
   *
   * Concrete case (user bug 2026-04-28, follow-up to 0.1.31): on YouTube
   * watch pages the very first insertion attempt sometimes fires before
   * `#primary-inner > #below` has been built but after `ytd-watch-metadata`
   * is in the document. The fallback inserts the panel into `#below` —
   * which on narrow viewports with a playlist sits BELOW
   * `ytd-playlist-panel-renderer` and any in-flow ad slots. Marking that
   * fallback as tentative lets the retry loop migrate the panel up to
   * `#primary-inner` on a subsequent attempt.
   */
  tentative?: boolean;
}

export function insertPanel(panel: HTMLElement, ctx: AppContext): InsertionResult {
  const pos: SliderPosition = ctx.settingsStore.getKey('sliderPosition');
  const choice = chooseAnchor(pos, ctx);

  if (choice.parent) {
    // Skip a redundant move when the panel is already at the chosen spot
    // AND the next-sibling matches what we'd insert before. This keeps
    // SPA-reattach idempotent and avoids forcing layout reflow on the host.
    const alreadyThere =
      panel.parentElement === choice.parent &&
      (choice.before == null || panel.nextSibling === choice.before);
    if (!alreadyThere) {
      try {
        panel.parentElement?.removeChild(panel);
      } catch {
        /* moved by host framework */
      }

      try {
        // The `before` reference may have become stale: YouTube re-renders
        // #top-row on every yt-navigate-finish, so the cached `info`
        // element from chooseAnchor is occasionally no longer a child of
        // its parent by the time we call insertBefore. Verify and fall
        // back to appendChild when that happens.
        if (choice.before && choice.parent.contains(choice.before)) {
          choice.parent.insertBefore(panel, choice.before);
        } else {
          choice.parent.appendChild(panel);
        }
      } catch (e) {
        // Last-ditch: log and let the orchestrator retry on the next SPA
        // navigation. Don't propagate -- a single insertion failure should
        // never tear down the whole bootstrap.
        // eslint-disable-next-line no-console
        console.warn('[VIDEO-SPEEDS] panel insertion failed:', e);
        return { parent: null, anchor: 'no-anchor' };
      }
    }
  } else {
    // No anchor — leave the panel detached. Orchestrator will retry on
    // the next SPA-navigation event.
    try {
      panel.parentElement?.removeChild(panel);
    } catch {
      /* swallow */
    }
  }

  return { parent: choice.parent, anchor: choice.anchor, tentative: choice.tentative };
}

interface AnchorChoice {
  parent: Element | null;
  anchor: InsertionAnchor;
  /** When set, panel is inserted before this node (sibling of `before`). */
  before?: Node | null;
  /** Tentative — see InsertionResult.tentative. */
  tentative?: boolean;
}

function chooseAnchor(pos: SliderPosition, ctx: AppContext): AnchorChoice {
  // The `pos` argument is intentionally unused here. The original
  // userscript (`.user.js:4884-4894`) keeps the main panel (buttons +
  // gear) in its normal spot for ALL three positions -- only the
  // SLIDER migrates into player chrome on `video`. Slider migration
  // is owned by `panel.applyLayout()` which talks to discovery
  // directly; the panel's own anchor is decided by the same fall-through
  // chain regardless of `pos`. Keeping the arg for API symmetry +
  // future-proofing (e.g. a "popup-window" position would need it).
  void pos;

  // 1. RuTube non-video bail-out (user bug 2026-04-28). Channel / feed /
  //    search / profile pages don't host a playable video the user wants
  //    to control. The userscript reference relies on RT class selectors
  //    (`video-page-layout-module__player`) that simply don't exist on
  //    those pages, so its `waitForAnyElement` never fires. Our
  //    DiscoveryEngine, however, has heuristic + cache fallback and will
  //    happily promote a channel-banner preview <video> (muted, 470x264,
  //    autoplaying) to playerContainer -- dropping our panel into the
  //    channel header. Allow-list the paths we explicitly support; it's
  //    easier to audit than a deny-list and matches the userscript's
  //    effective behavior on RT.
  if (ctx.site === 'rutube' && !isRutubeVideoPath(location.pathname)) {
    return { parent: null, anchor: 'no-anchor' };
  }

  // 1b. Dzen has the same problem in a sharper form: its feed is wall-to-wall
  //     autoplaying preview <video> elements, so without a path filter the
  //     heuristic strategy would promote whichever tile happens to be on
  //     screen and drop the panel into the feed.
  if (ctx.site === 'dzen' && !isDzenVideoPath(location.pathname)) {
    return { parent: null, anchor: 'no-anchor' };
  }

  // 1c. Same for VK, and it matters more there: the host patterns already scope
  //     us to the video section, but that section's feed and playlist pages are
  //     grids of preview tiles.
  if (ctx.site === 'vk' && !isVkVideoPath(location.pathname)) {
    return { parent: null, anchor: 'no-anchor' };
  }

  // 2. YouTube fast path. `#primary-inner` has exactly two children on
  //    /watch pages: `#player` (the play surface) and `#below` (everything
  //    underneath -- metadata, comments, and on narrow viewports with a
  //    playlist video the in-flow `ytd-playlist-panel-renderer` that YT
  //    relocates here from `#secondary`). Inserting BEFORE `#below` puts
  //    our panel directly between the player and everything below it,
  //    immune to the narrow-viewport playlist case (user bug 2026-04-28
  //    where anchoring before `ytd-watch-metadata` landed us under the
  //    playlist). We bypass Discovery here so a stale SelectorCache entry
  //    can't pin us back onto #top-row inside Polymer.
  if (ctx.site === 'youtube') {
    const below = document.querySelector('#primary-inner > #below');
    if (below?.parentElement) {
      return {
        parent: below.parentElement,
        anchor: 'before-info',
        before: below,
      };
    }
    // Tentative fallback for the bootstrap window where
    // `#primary-inner > #below` hasn't been built yet. `ytd-watch-metadata`
    // appears earlier on cold YT loads (its parent is whatever container
    // YT has built so far — often `#below` directly). We insert here so
    // the panel is at least visible, but flag the result as tentative so
    // the retry loop migrates us to `#primary-inner` once it's ready.
    const metadata = document.querySelector('ytd-watch-metadata');
    if (metadata?.parentNode && metadata.parentElement) {
      return {
        parent: metadata.parentElement,
        anchor: 'before-info',
        before: metadata,
        tentative: true,
      };
    }
  }

  // 3. RuTube fast path — direct DOM query. RuTube's modern layout has
  //    `.video-page-layout-module__left` as the LEFT column (block stack)
  //    containing the player wrapper (`.video-page-layout-module__player`)
  //    + the page-info wrapper as block siblings. Inserting our panel
  //    BETWEEN those two siblings (i.e. after the player wrapper) gives
  //    the panel its own row above the title block.
  //
  //    We bypass `discovery.resolve('playerContainer')` here because the
  //    cache can stale-resolve to `section.video-player` (the inner
  //    player), whose parent is an anonymous DIV inside the player
  //    wrapper. Inserting there lands us INSIDE the player chrome (and
  //    falling through to before-info would land us inside the
  //    `pageHeaderRow` flex row — squeezing the title sideways).
  if (ctx.site === 'rutube') {
    const layoutPlayer = document.querySelector('[class*="video-page-layout-module__player"]');
    if (layoutPlayer?.parentElement) {
      return {
        parent: layoutPlayer.parentElement,
        anchor: 'after-player',
        before: skipOwnPanel(layoutPlayer.nextSibling),
      };
    }
  }

  // 3b. Dzen fast path — direct DOM query, for the same reason as RuTube's:
  //     the cache can stale-resolve `playerContainer` to one of the inner
  //     boxes, all of which report the video's exact dimensions, and inserting
  //     next to those lands the panel INSIDE the viewer overlay on top of the
  //     picture. `playerWrap` is the outermost box that still matches the
  //     video, and its parent is the content column — the panel gets its own
  //     row between the player and the description, which is where a reader
  //     expects it. Measured on live dzen.ru 2026-08-10.
  if (ctx.site === 'dzen') {
    const playerWrap = document.querySelector(
      '[class*="video-viewer--video-viewer-player__playerWrap"]',
    );
    if (playerWrap?.parentElement) {
      return {
        parent: playerWrap.parentElement,
        anchor: 'after-player',
        before: skipOwnPanel(playerWrap.nextSibling),
      };
    }
  }

  const info = ctx.discovery.resolve('infoElem');
  const player = ctx.discovery.resolve('playerContainer');

  // 4. Preferred: insert before infoElem if it lives OUTSIDE the player.
  //    Some sites (RuTube live) render the title as a player-overlay --
  //    `infoElem.parentElement` is the player wrapper itself, so inserting
  //    there would put us on top of the <video>. Detect that case and skip.
  if (info?.parentElement && !isInsidePlayer(info, player)) {
    return {
      parent: info.parentElement,
      anchor: 'before-info',
      before: info,
    };
  }

  // 5. Fallback: insert as the next sibling of the player container.
  if (player?.parentElement) {
    return {
      parent: player.parentElement,
      anchor: 'after-player',
      before: skipOwnPanel(player.nextSibling),
    };
  }

  // 6. RuTube last-resort: anchor before the page <h1>. Fires only when
  //    every modular layout selector failed (post-RuTube-redesign cold
  //    start, or the page-info module has been swapped out under us).
  //    Mirror .user.js:4967-4974 final fallback. Tentative — we'd much
  //    rather land in the modular layout than next to a stray h1.
  if (ctx.site === 'rutube') {
    const h1 = document.querySelector('h1');
    if (h1?.parentElement) {
      return {
        parent: h1.parentElement,
        anchor: 'before-info',
        before: h1,
        tentative: true,
      };
    }
  }

  // 7. No anchor -- defer.
  return { parent: null, anchor: 'no-anchor' };
}

/**
 * True when `el` (or its parent chain) is contained by `player`. Used to
 * reject `infoElem` matches that are actually a title overlay layered on
 * top of the video element (RuTube live pages do this).
 */
function isInsidePlayer(el: Element | null, player: Element | null): boolean {
  if (!el || !player) return false;
  return player === el || player.contains(el);
}

/**
 * Allow-list of RuTube paths where the panel should be inserted.
 *
 *   /video/<id>/...        — main video page (the typical case)
 *   /shorts/<id>/...       — shorts player
 *   /play/embed/<id>/...   — embedded player (panel still useful for
 *                            hotkey users embedding in another site)
 *
 * Everything else (channels at `/channel/<id>/` and `/u/<name>/`, feed,
 * search, browse, profile, my, notifications, category, tags, trends,
 * auth) returns false — the userscript reference relies on RT class
 * selectors that don't exist on those pages so it implicitly bails;
 * our heuristic-driven DiscoveryEngine needs an explicit filter.
 */
export function isRutubeVideoPath(pathname: string): boolean {
  return (
    pathname.startsWith('/video/') ||
    pathname.startsWith('/shorts/') ||
    pathname.startsWith('/play/embed/')
  );
}

/**
 * Allow-list of Dzen paths where the panel should be inserted.
 *
 *   /video/watch/<id>  — the video viewer, the only page with a real player
 *   /shorts/<id>       — vertical short, same viewer shell
 *
 * Everything else is feed, channel or article. Those pages are full of
 * autoplaying preview <video> tiles, which is exactly what the heuristic
 * discovery strategy would latch onto without this filter.
 */
export function isDzenVideoPath(pathname: string): boolean {
  return pathname.startsWith('/video/watch/') || pathname.startsWith('/shorts/');
}

/**
 * Walk past our own panel(s) when computing a `before`-reference. After the
 * first successful insert, our panel BECOMES `playerContainer.nextSibling`,
 * so a naive `before: layoutPlayer.nextSibling` would self-reference us in
 * the idempotent guard (and trigger a needless re-insert tug-of-war with
 * the removal observer). Skip past `.vs-panel` elements so the reference
 * always points at a non-self sibling (or null at the end of the list).
 */
function skipOwnPanel(node: Node | null): Node | null {
  let cur = node;
  while (cur && cur instanceof Element && cur.classList.contains('vs-panel')) {
    cur = cur.nextSibling;
  }
  return cur;
}

/**
 * Remove the panel from its current host. Used by the orchestrator on
 * dispose / SPA cleanup.
 */
export function detachPanel(panel: HTMLElement): void {
  panel.parentElement?.removeChild(panel);
}
