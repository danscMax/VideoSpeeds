/**
 * Speed controls for the YouTube Shorts layout.
 *
 * Why a separate surface instead of the normal panel: Shorts is a vertical
 * full-height player with no metadata column, so the panel has nowhere to
 * anchor — it is removed there (see index.ts). Until now that left Shorts with
 * no visible control at all, and a viewer whose regular videos run at 2x found
 * Shorts silently sped up with no way to change it (user report 2026-08-10).
 *
 * Where it mounts: `reel-action-bar-view-model`, the 52px column to the right
 * of the video holding like / dislike / comment / share. Measured on a live
 * Short 2026-08-10 — 52x360, four buttons. Our stack joins the bottom of that
 * column, so it reads as one of the player's own controls and inherits its
 * position on every viewport.
 *
 * Speed changes go through `setGlobal`, so a choice made here sticks; and
 * because the store is pointed at the 'shorts' bucket while on this surface,
 * it sticks for Shorts ONLY.
 */

import type { AppContext } from '../app/context';
import { speedBoundsFor } from '../config';
import { setGlobal } from '../speed/controller';

const ROOT_ID = 'vs-shorts-controls';
const ACTION_BAR = 'reel-action-bar-view-model';
/** One press. Matches the hotkey step people already know from the panel. */
const STEP = 0.25;

export interface ShortsControls {
  /** Re-mount if the reel was swapped; safe to call on every navigation. */
  ensureMounted(): void;
  /** Repaint the readout after an external speed change (hotkey, popup). */
  refresh(speed: number): void;
  /** Take it off the page — used when leaving Shorts. */
  remove(): void;
}

export function createShortsControls(ctx: AppContext): ShortsControls {
  const bounds = speedBoundsFor(ctx.site);
  let root: HTMLElement | null = null;
  let readout: HTMLElement | null = null;

  const round = (n: number): number => Math.round(n * 100) / 100;
  const clamp = (n: number): number => Math.min(bounds.max, Math.max(bounds.min, round(n)));

  const paint = (speed: number): void => {
    if (readout) readout.textContent = `${round(speed)}x`;
  };

  const nudge = (delta: number): void => {
    const next = clamp(ctx.speedStore.current() + delta);
    if (next === round(ctx.speedStore.current())) return;
    paint(next);
    void setGlobal(ctx, next);
  };

  const button = (glyph: string, title: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vs-shorts-btn';
    b.textContent = glyph;
    b.title = title;
    b.setAttribute('aria-label', title);
    ctx.cleanup.addEventListener(b, 'click', (e) => {
      // The reel container treats clicks as play/pause and as scroll intent.
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return b;
  };

  const build = (): HTMLElement => {
    const t = ctx.i18n.t;
    const el = document.createElement('div');
    el.id = ROOT_ID;
    el.className = 'vs-shorts-controls';

    readout = document.createElement('button');
    readout.className = 'vs-shorts-readout';
    readout.setAttribute('type', 'button');
    readout.title = t('shorts.reset.tip');
    readout.setAttribute('aria-label', t('shorts.reset.tip'));
    ctx.cleanup.addEventListener(readout, 'click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Back to normal speed — the single most likely thing someone wants
      // from a control they only noticed because the video sounded wrong.
      paint(bounds.defaultSpeed);
      void setGlobal(ctx, bounds.defaultSpeed);
    });

    el.append(
      button('+', t('shorts.faster.tip'), () => nudge(STEP)),
      readout,
      button('−', t('shorts.slower.tip'), () => nudge(-STEP)),
    );
    paint(ctx.speedStore.current());
    return el;
  };

  return {
    ensureMounted(): void {
      const bar = document.querySelector(ACTION_BAR);
      if (!bar) return;
      // The reel renderer is swapped on every scroll, taking our node with it,
      // so "already built" is not the same as "still on the page".
      if (root && bar.contains(root)) {
        paint(ctx.speedStore.current());
        return;
      }
      root?.parentElement?.removeChild(root);
      root = build();
      bar.appendChild(root);
      ctx.logger.info('shorts: controls mounted into the action bar');
    },
    refresh(speed: number): void {
      paint(speed);
    },
    remove(): void {
      root?.parentElement?.removeChild(root);
      root = null;
      readout = null;
    },
  };
}
