/**
 * Decide WHERE the panel lands in the page DOM.
 *
 * The `sliderPosition` setting picks one of three behaviors:
 *   - 'right'   -> append into the right-controls bar (next to existing controls)
 *   - 'bottom'  -> append into the player container (below controls)
 *   - 'video'   -> YouTube only, embed into the player chrome's bottom row
 *
 * Each branch falls back to the next less-specific anchor when the chosen
 * one is missing -- the panel always lands somewhere valid, even on a
 * partially-loaded SPA navigation.
 */

import type { AppContext } from '../app/context';
import type { SliderPosition } from '../storage/types';

export interface InsertionResult {
  parent: Element | null;
  anchor: 'right-controls' | 'player' | 'video-overlay' | 'body-fallback';
}

export function insertPanel(panel: HTMLElement, ctx: AppContext): InsertionResult {
  const pos: SliderPosition = ctx.settingsStore.getKey('sliderPosition');
  const result = chooseAnchor(pos, ctx);
  if (result.parent) {
    // Avoid duplicate insertion if the same panel is being re-inserted.
    if (panel.parentElement && panel.parentElement === result.parent) {
      return result;
    }
    panel.parentElement?.removeChild(panel);
    result.parent.appendChild(panel);
  } else {
    document.body.appendChild(panel);
  }
  return result;
}

function chooseAnchor(pos: SliderPosition, ctx: AppContext): InsertionResult {
  if (pos === 'right') {
    const right = ctx.discovery.resolve('rightControls');
    if (right) return { parent: right, anchor: 'right-controls' };
  }
  if (pos === 'video' && ctx.site === 'youtube') {
    const controlsBar = ctx.discovery.resolve('controlsContainer');
    if (controlsBar) return { parent: controlsBar, anchor: 'video-overlay' };
  }
  // 'bottom' (and the fall-through for the others)
  const player = ctx.discovery.resolve('playerContainer');
  if (player) return { parent: player, anchor: 'player' };
  const right = ctx.discovery.resolve('rightControls');
  if (right) return { parent: right, anchor: 'right-controls' };
  return { parent: null, anchor: 'body-fallback' };
}

/**
 * Remove the panel from its current host. Used by Wave 1.10 SPA re-attach
 * when the player container changes between RuTube videos.
 */
export function detachPanel(panel: HTMLElement): void {
  panel.parentElement?.removeChild(panel);
}
