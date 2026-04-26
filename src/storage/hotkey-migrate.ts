/**
 * Normalize legacy hotkey shapes coming out of page-localStorage.
 *
 * Old userscript versions (pre-1.0) stored a single `Hotkey` object instead
 * of an array. Newer versions store `Hotkey[]`. Some installs end up with an
 * empty array (after a buggy edit). We normalise all three to "non-empty
 * `Hotkey[]`, falling back to the defaults" so downstream code only ever
 * sees one shape.
 */

import type { Hotkey } from './types';

/**
 * Treat any non-Hotkey-shaped input as missing. The match is structural:
 * we accept anything with a string `key` and 4 booleans, ignoring extras.
 */
function isHotkey(value: unknown): value is Hotkey {
  if (!value || typeof value !== 'object') return false;
  const h = value as Record<string, unknown>;
  return (
    typeof h.key === 'string' &&
    h.key.length > 0 &&
    typeof h.ctrl === 'boolean' &&
    typeof h.shift === 'boolean' &&
    typeof h.alt === 'boolean' &&
    typeof h.meta === 'boolean'
  );
}

/**
 * Normalise an unknown raw value into a non-empty `Hotkey[]`.
 *
 * Order of precedence:
 *   - already a non-empty array of valid Hotkeys -> filter and return
 *   - a single Hotkey object (legacy)            -> wrap in array
 *   - empty array, missing, or malformed         -> return defaults
 */
export function normalizeHotkeys(raw: unknown, defaults: Hotkey[]): Hotkey[] {
  if (Array.isArray(raw)) {
    const valid = raw.filter(isHotkey);
    return valid.length > 0 ? valid : defaults;
  }
  if (isHotkey(raw)) {
    return [raw];
  }
  return defaults;
}
