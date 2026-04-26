/**
 * Runtime constants ported from `YouTube & HDRezka Speeds.user.js`.
 *
 * Per-site speed bounds and storage keys are derived once at bootstrap from
 * the detected `Site` so feature modules can stay site-agnostic.
 */

import type { Site } from './app/ports';

/**
 * Speed step used by Speed-Up / Slow-Down hotkeys.
 *
 * Source: hotkey handlers in `.user.js:5077-5108` use literal `+0.1` /
 * `-0.1`, and the i18n labels (`hotkeys.speedup_label` etc.) reflect the
 * same value to the user. Keep these in sync if you ever change the step.
 */
export const SPEED_STEP = 0.1;

/**
 * Per-site speed bounds. HDRezka is intentionally absent -- the extension
 * scope is YouTube + RuTube only (separate Improve-RuTube project covers
 * the rest, see docs/CAVEATS.md "Dropped scope").
 */
export interface SpeedBounds {
  readonly min: number;
  readonly max: number;
  readonly defaultSpeed: number;
}

const SPEED_BOUNDS: Record<Site, SpeedBounds> = {
  youtube: { min: 0.75, max: 4.0, defaultSpeed: 2.75 },
  rutube:  { min: 1.0,  max: 3.0, defaultSpeed: 1.5  },
};

export function speedBoundsFor(site: Site): SpeedBounds {
  return SPEED_BOUNDS[site];
}

/**
 * Storage keys per site. Match the legacy userscript keys verbatim so the
 * Wave 1.4 page-localStorage migration finds them at first run.
 */
export interface StorageKeys {
  readonly settings: string;
  readonly speed: string;
}

const STORAGE_KEYS: Record<Site, StorageKeys> = {
  youtube: {
    settings: 'youtube-speed-settings',
    speed:    'youtube-selected-speed',
  },
  rutube: {
    settings: 'rutube-speed-settings',
    speed:    'rutube-selected-speed',
  },
};

export function storageKeysFor(site: Site): StorageKeys {
  return STORAGE_KEYS[site];
}

/**
 * Cache key prefix used by SelectorCache for per-host entries.
 *
 * Shape: `vs-cache:<host>` -> { schema_version, script_version, entries, backups }
 * (single bag in `browser.storage.local`, hydrated once at bootstrap).
 *
 * NOT compatible with the legacy userscript shape (`vs-cache:<host>:<selectorKey>`,
 * one GM-storage key per selector + parallel `vs-cache:backup:...`); the two
 * namespaces are isolated so they can't overwrite each other, and the
 * Wave 1.4 TM-migration deliberately skips cache translation (audit S18,
 * see storage/migration-tm.ts). Stale heuristic state across a project
 * boundary is worse than a cold start (audit M1).
 */
export const SELECTOR_CACHE_PREFIX = 'vs-cache:';

/**
 * Marker stored in settings after the one-time TM page-localStorage
 * migration succeeds, so the import never re-runs and never clobbers
 * subsequent extension-side edits.
 */
export const TM_MIGRATION_FLAG = '__migrated_from_tm';
