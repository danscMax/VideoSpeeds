/**
 * Concrete data types backing SettingsStore / SpeedStore.
 *
 * Lives in storage/ rather than app/ports.ts because the port interface owns
 * the contract while this module owns the shape. Anything that wants to
 * inspect a Settings field still goes through `ctx.settingsStore.get()` --
 * never imports this file directly outside storage/, migration, and tests.
 */

import { defaultPresetsFor } from '../config';
import type { Site } from '../app/ports';
import type { Lang } from '../i18n/dict';

/**
 * One key-combo entry. Matches the legacy userscript shape verbatim
 * (.user.js:1949-1958) so page-localStorage migration is a no-op deserialise.
 */
export interface Hotkey {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  /** KeyboardEvent.code, e.g. "KeyC", "Insert", "ArrowUp". */
  key: string;
}

/** Where the speed slider is rendered relative to the speed buttons. */
export type SliderPosition = 'right' | 'bottom' | 'video';

/**
 * The full settings object persisted under `<site>-speed-settings`. A user
 * who installed the extension without the userscript starts from
 * `defaultSettings(lang)`.
 */
export interface Settings {
  sliderPosition: SliderPosition;
  rememberSpeed: boolean;
  /** RuTube only: hide raichu overlay title (incl. fullscreen). */
  hidePlayerTitle: boolean;
  /** RuTube only: hide Premium banners + CTA blocks. */
  hidePremium: boolean;
  language: Lang;
  hotkeys: {
    speedUp: Hotkey[];
    speedDown: Hotkey[];
  };
  /**
   * The visible set of speed-preset buttons in the in-player panel.
   * User can toggle individual values via Settings → General → "Speed
   * buttons". Picked from `SPEED_POOL` filtered to the site's
   * [min, max] bounds. Empty array is treated as "use site defaults"
   * to keep the panel useful even after an accidental clear-all.
   */
  speedPresets: number[];
  /** Set after a successful one-time TM-import on first run. */
  __migrated_from_tm?: boolean;
}

/**
 * Built fresh per init from the detected language. Hotkeys mirror the
 * userscript defaults (Ctrl+C / Ctrl+V) so existing users feel no change.
 *
 * Second slot per action: Ctrl+Insert / Shift+Insert. The original
 * userscript hardcoded these as a never-removed fallback for HTPC
 * remotes; we surface them as removable defaults instead — the user
 * still discovers them in Settings → Shortcuts and can drop them if
 * they're hostile to anyone's keyboard layout (audit B2.5).
 */
export function defaultSettings(language: Lang, site?: Site): Settings {
  return {
    sliderPosition: 'right',
    rememberSpeed: true,
    hidePlayerTitle: false,
    hidePremium: false,
    language,
    hotkeys: {
      speedUp: [
        { ctrl: true, shift: false, alt: false, meta: false, key: 'KeyC' },
        { ctrl: true, shift: false, alt: false, meta: false, key: 'Insert' },
      ],
      speedDown: [
        { ctrl: true, shift: false, alt: false, meta: false, key: 'KeyV' },
        { ctrl: false, shift: true, alt: false, meta: false, key: 'Insert' },
      ],
    },
    // Site-aware defaults so a fresh install on YouTube gets the YT
    // preset row (1.5x-3.5x), and a fresh install on RuTube gets the
    // RT preset row (1x-3x). Without a site (test/standalone), fall
    // back to a vanilla 1x-2x trio.
    speedPresets: site ? [...defaultPresetsFor(site)] : [1, 1.5, 2],
  };
}
