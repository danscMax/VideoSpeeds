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
import type { SliderPosition } from '../storage/types';

export type InsertionAnchor =
  | 'before-info'    // sibling of infoElem (preferred -- always visible)
  | 'after-player'   // sibling right after player container
  | 'video-overlay'  // inside player chrome (YT 'video' position only)
  | 'no-anchor';     // could not find a valid spot; defer

export interface InsertionResult {
  parent: Element | null;
  anchor: InsertionAnchor;
}

export function insertPanel(panel: HTMLElement, ctx: AppContext): InsertionResult {
  const pos: SliderPosition = ctx.settingsStore.getKey('sliderPosition');
  const choice = chooseAnchor(pos, ctx);

  if (choice.parent) {
    // Skip a redundant move when the panel is already at the chosen spot
    // AND the next-sibling matches what we'd insert before. This keeps
    // SPA-reattach idempotent and avoids forcing layout reflow on the host.
    const alreadyThere = panel.parentElement === choice.parent &&
      (choice.before == null || panel.nextSibling === choice.before);
    if (!alreadyThere) {
      try { panel.parentElement?.removeChild(panel); } catch { /* moved by host framework */ }

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
    try { panel.parentElement?.removeChild(panel); } catch { /* swallow */ }
  }

  return { parent: choice.parent, anchor: choice.anchor };
}

interface AnchorChoice {
  parent: Element | null;
  anchor: InsertionAnchor;
  /** When set, panel is inserted before this node (sibling of `before`). */
  before?: Node | null;
}

function chooseAnchor(pos: SliderPosition, ctx: AppContext): AnchorChoice {
  // 1. The 'video' position on YouTube -- in-chrome overlay.
  if (pos === 'video' && ctx.site === 'youtube') {
    const controlsBar = ctx.discovery.resolve('controlsContainer');
    if (controlsBar) return { parent: controlsBar, anchor: 'video-overlay' };
  }

  const info = ctx.discovery.resolve('infoElem');
  const player = ctx.discovery.resolve('playerContainer');

  // 2. Preferred: insert before infoElem if it lives OUTSIDE the player.
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

  // 3. Fallback: insert as the next sibling of the player container.
  if (player?.parentElement) {
    return {
      parent: player.parentElement,
      anchor: 'after-player',
      before: player.nextSibling,
    };
  }

  // 4. No anchor -- defer.
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
 * Remove the panel from its current host. Used by the orchestrator on
 * dispose / SPA cleanup.
 */
export function detachPanel(panel: HTMLElement): void {
  panel.parentElement?.removeChild(panel);
}
