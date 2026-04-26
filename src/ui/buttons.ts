/**
 * Speed buttons row -- a horizontal strip of buttons (e.g. 1x, 1.25x,
 * 1.5x, 2x, 2.5x, 3x) plus the active-state marker.
 *
 * Render is a pure function; it returns an HTMLElement the caller inserts
 * into the player. Click handlers are attached in Wave 1.8b -- this module
 * only emits structural markup + class toggles.
 */

import { safeSetInnerHTML } from './safe-html';

export interface ButtonsRowOptions {
  /** Speeds to render as buttons; usually derived from per-site bounds. */
  speeds: readonly number[];
  /** Currently applied speed -- gets the `.speed-button.active` class. */
  current: number;
}

const ROW_CLASS = 'speed-buttons-row';
const BTN_CLASS = 'speed-button';
const ACTIVE_CLASS = 'active';

export function renderButtonsRow(opts: ButtonsRowOptions): HTMLElement {
  const row = document.createElement('div');
  row.className = ROW_CLASS;

  const html = opts.speeds
    .map((s) => {
      const active = isSameSpeed(s, opts.current) ? ` ${ACTIVE_CLASS}` : '';
      return (
        `<button type="button" class="${BTN_CLASS}${active}" data-vs-speed="${s}">` +
        formatSpeedLabel(s) +
        '</button>'
      );
    })
    .join('');

  safeSetInnerHTML(row, html);
  return row;
}

/**
 * Toggle the `.active` class to whichever button matches `current`. No
 * re-render -- expects the row from `renderButtonsRow` is already in DOM.
 */
export function refreshActiveButton(row: Element, current: number): void {
  const buttons = row.querySelectorAll<HTMLButtonElement>(`.${BTN_CLASS}`);
  for (const btn of Array.from(buttons)) {
    const speedAttr = btn.getAttribute('data-vs-speed');
    const speed = speedAttr ? parseFloat(speedAttr) : NaN;
    btn.classList.toggle(ACTIVE_CLASS, isSameSpeed(speed, current));
  }
}

/**
 * Default preset speeds for each site. Mirrors the userscript's per-site
 * presets visible in the panel.
 */
export const DEFAULT_PRESETS: Readonly<Record<string, readonly number[]>> = {
  youtube: [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4],
  rutube:  [1, 1.25, 1.5, 1.75, 2, 2.5, 3],
};

function isSameSpeed(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001;
}

/**
 * Render a speed value as a button label: integers get "2x", fractions
 * get the minimal decimal form ("1.5x", "1.25x"). Avoids visual noise
 * like "1.00x" or "1.50x" while keeping precision for the in-between values.
 */
function formatSpeedLabel(s: number): string {
  if (Number.isInteger(s)) return `${s}x`;
  return s.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + 'x';
}
