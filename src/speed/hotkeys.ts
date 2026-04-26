/**
 * Hotkey capture / format / matching.
 *
 * The Hotkey shape (`{ ctrl, shift, alt, meta, key }`) lives in
 * src/storage/types.ts because the SettingsStore persists it. This module
 * only deals with the runtime side: build a Hotkey from a KeyboardEvent,
 * render one for display, and check whether an event matches a key array.
 *
 * Ported from .user.js:1879-1958.
 */

import type { Hotkey } from '../storage/types';

const KEY_DISPLAY: Record<string, string> = {
  Insert: 'Insert',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Esc',
  Tab: 'Tab',
  Backspace: 'Backspace',
};

/**
 * Render KeyboardEvent.code as a user-facing key name. KeyA -> A, Digit5 -> 5,
 * Insert -> Insert, ArrowUp -> ↑. Falls through to the raw code for anything
 * we don't have a mapping for -- always renderable, never throws.
 */
export function normalizeKeyName(code: string): string {
  if (KEY_DISPLAY[code]) return KEY_DISPLAY[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  return code;
}

/**
 * Render a Hotkey for the settings UI: "Ctrl + Shift + C", "Insert",
 * "Alt + ↑". Modifier order matches the desktop convention.
 */
export function formatHotkey(hotkey: Hotkey): string {
  const parts: string[] = [];
  if (hotkey.ctrl) parts.push('Ctrl');
  if (hotkey.shift) parts.push('Shift');
  if (hotkey.alt) parts.push('Alt');
  if (hotkey.meta) parts.push('Meta');
  parts.push(normalizeKeyName(hotkey.key));
  return parts.join(' + ');
}

/**
 * Build a Hotkey from a KeyboardEvent. Reads modifier flags + event.code
 * (NOT event.key, so layout-independent: pressing C in any layout produces
 * "KeyC").
 */
export function captureHotkey(event: KeyboardEvent): Hotkey {
  return {
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
    meta: event.metaKey,
    key: event.code,
  };
}

/** True if a single Hotkey definition matches the live event. */
export function matchesSingleHotkey(event: KeyboardEvent, hotkey: Hotkey): boolean {
  return (
    event.ctrlKey === hotkey.ctrl &&
    event.shiftKey === hotkey.shift &&
    event.altKey === hotkey.alt &&
    event.metaKey === hotkey.meta &&
    event.code === hotkey.key
  );
}

/** True if any hotkey in the array matches the live event. */
export function matchesHotkeyArray(event: KeyboardEvent, hotkeys: readonly Hotkey[] | undefined): boolean {
  if (!Array.isArray(hotkeys)) return false;
  for (const h of hotkeys) {
    if (matchesSingleHotkey(event, h)) return true;
  }
  return false;
}
