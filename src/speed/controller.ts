/**
 * Speed controller -- the only module that touches `video.playbackRate`.
 *
 * Three entry points:
 *   - setSpeed(ctx, speed)         -- applies + persists as current
 *   - setTemporary(ctx, speed)     -- applies as one-shot (smart-store)
 *   - setGlobal(ctx, speed)        -- applies + persists + forces
 *                                     rememberSpeed=true + toast
 *   - handleClick(ctx, speed)      -- single click -> temp, double -> global
 *
 * Everything goes through ctx (audit C2). The controller never reaches into
 * UI directly: ui.refreshButtons / refreshSlider / showNotification keep
 * the dependency arrow pointing one way (controller -> ports, never
 * controller -> ui module).
 *
 * Ported from .user.js:2263-2412 with the inline retry loop deferred to
 * the site-bootstrap layer (Wave 1.10 attachToVideo) -- the controller
 * here assumes the caller passes a ready video. If `ctx.discovery.resolve`
 * returns null we just log and bail; the playing/loadedmetadata listeners
 * in the site layer pick up the speed when the video becomes ready.
 */

import type { AppContext } from '../app/context';
import { speedBoundsFor } from '../config';

const CLICK_DEBOUNCE_MS = 400;

/** Per-context click-debounce state. Keyed by AppContext so multiple
 *  initialised tabs (popup vs in-player) don't share counters. */
const clickState = new WeakMap<AppContext, { count: number; timer: number | null }>();

/** Internal: apply + currentSpeed sync, pure of side-effects beyond the video. */
function applyToVideo(ctx: AppContext, speed: number): boolean {
  const el = ctx.discovery.resolve('video');
  if (!(el instanceof HTMLVideoElement)) {
    ctx.logger.debug('controller.setSpeed: video not ready, deferring');
    return false;
  }
  try {
    el.playbackRate = speed;
    return true;
  } catch (e) {
    ctx.logger.error('controller.setSpeed: failed to set playbackRate', e);
    return false;
  }
}

function clamp(ctx: AppContext, speed: number): number {
  const bounds = speedBoundsFor(ctx.site);
  if (!Number.isFinite(speed)) return bounds.defaultSpeed;
  // Round to 1 decimal so successive +0.1 / -0.1 hotkey presses don't
  // accumulate float drift (1 + 0.1 + 0.1 + ... -> 1.7000000000000002).
  // Original userscript does Math.round(x*10)/10 in every speedUp/Down
  // hotkey path (.user.js:5078,5088,5099,5108).
  const rounded = Math.round(speed * 100) / 100;
  return Math.min(bounds.max, Math.max(bounds.min, rounded));
}

/**
 * Apply a speed and persist it as the current value. UI + popup updates
 * are issued through ctx.ui regardless of whether the video element was
 * available -- the panel buttons should reflect intent immediately.
 */
export async function setSpeed(ctx: AppContext, speed: number): Promise<void> {
  const validSpeed = clamp(ctx, speed);
  applyToVideo(ctx, validSpeed);
  await ctx.speedStore.setCurrent(validSpeed);
  ctx.ui.refreshButtons(validSpeed);
  ctx.ui.refreshSlider(validSpeed);
  ctx.logger.debug('controller.setSpeed', validSpeed);
}

/**
 * One-shot speed for this video only -- single click on a speed button.
 * Doesn't touch `current`; instead stores as `smart`. Cleared automatically
 * when the next video loads (Wave 1.10 attachToVideo).
 */
export async function setTemporary(ctx: AppContext, speed: number): Promise<void> {
  const validSpeed = clamp(ctx, speed);
  applyToVideo(ctx, validSpeed);
  await ctx.speedStore.setSmart(validSpeed);
  ctx.ui.refreshButtons(validSpeed);
  ctx.ui.refreshSlider(validSpeed);
  ctx.logger.debug('controller.setTemporary', validSpeed);
}

/**
 * "Make this my default" -- double click on a speed button. Persists as
 * current, force-enables rememberSpeed (audit-aligned with userscript
 * semantics: a deliberate double-click is a strong signal), clears the
 * smart override, and surfaces a toast so the user knows the choice stuck.
 *
 * Order matters (matches .user.js:2296-2326): clear smart + persist BEFORE
 * touching video.playbackRate. If a ratechange-driven re-attach fires
 * between applyToVideo and setSmart(null), the old code path read stale
 * smart and re-applied the previous value.
 */
export async function setGlobal(ctx: AppContext, speed: number): Promise<void> {
  const validSpeed = clamp(ctx, speed);

  // Force-enable rememberSpeed if it was off. Userscript parity (.user.js:2300).
  if (ctx.settingsStore.getKey('rememberSpeed') === false) {
    await ctx.settingsStore.update({ rememberSpeed: true });
    ctx.logger.info('controller.setGlobal: rememberSpeed auto-enabled');
  }

  // Persist first, then push to video. Storage writes are fire-and-forget
  // (in-memory mirror updates synchronously) so we don't actually block.
  await ctx.speedStore.setSmart(null);
  await ctx.speedStore.setCurrent(validSpeed);
  applyToVideo(ctx, validSpeed);
  ctx.ui.refreshButtons(validSpeed);
  ctx.ui.refreshSlider(validSpeed);
  ctx.ui.showNotification(
    ctx.i18n.t('toast.speed_global', { speed: validSpeed }),
    'success',
  );
  ctx.logger.debug('controller.setGlobal', validSpeed);
}

/**
 * Click router: 1st click within debounce -> setTemporary; 2nd click ->
 * setGlobal. State is per-AppContext so each tab/popup keeps its own
 * counter.
 */
export function handleSpeedButtonClick(ctx: AppContext, speed: number): void {
  const state = clickState.get(ctx) ?? { count: 0, timer: null };
  state.count += 1;
  if (state.timer !== null) {
    clearTimeout(state.timer);
  }
  state.timer = window.setTimeout(() => {
    const finalCount = state.count;
    state.count = 0;
    state.timer = null;
    if (finalCount >= 2) {
      void setGlobal(ctx, speed);
    } else {
      void setTemporary(ctx, speed);
    }
  }, CLICK_DEBOUNCE_MS);
  clickState.set(ctx, state);
}

/**
 * Compute the speed to apply when a new <video> attaches.
 * Priority: smart (one-shot) -> current (if rememberSpeed) -> default.
 */
export function pickInitialSpeed(ctx: AppContext): number {
  const smart = ctx.speedStore.smart();
  if (smart !== null) return smart;
  if (ctx.settingsStore.getKey('rememberSpeed') === true) {
    return ctx.speedStore.current();
  }
  return speedBoundsFor(ctx.site).defaultSpeed;
}
