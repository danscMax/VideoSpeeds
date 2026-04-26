/**
 * Speed popup -- the small "1.50x" overlay that appears briefly after a
 * speed change. Lives inside a dedicated DOM node managed here; callers
 * just invoke `showSpeedPopup(value)`.
 *
 * Ported from .user.js:1960-1980. Idempotent on the popup DOM node.
 */

const POPUP_ID = 'speed-popup';
const VISIBLE_MS = 2000;

let hideTimer: number | null = null;

export function showSpeedPopup(speed: number, container: Element | null = null): void {
  const popup = ensurePopup(container);
  popup.textContent = speed.toFixed(2) + 'x';
  popup.classList.add('show');

  if (hideTimer !== null) clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    popup.classList.remove('show');
    hideTimer = null;
  }, VISIBLE_MS);
}

function ensurePopup(container: Element | null): HTMLElement {
  let popup = document.getElementById(POPUP_ID);
  if (popup) return popup;

  popup = document.createElement('div');
  popup.id = POPUP_ID;
  popup.className = 'speed-popup';
  // Inline starter styles; full styling comes from styles.ts (.speed-popup
  // and .speed-popup.show selectors).
  popup.style.cssText = 'pointer-events: none;';

  const host = container instanceof HTMLElement ? container : document.body;
  host.appendChild(popup);
  return popup;
}
