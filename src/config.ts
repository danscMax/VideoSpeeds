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

// Upper bound raised to 10x on both sites to accommodate the manual
// custom-speed input (Settings → General → "Speed buttons"). Browsers
// happily play HTML5 video at rates well above 4x, but slider drag past
// the default range gets coarser — power users wanting 5x-10x usually
// type the value rather than scrub for it.
// `defaultSpeed` is what a fresh-installed user lands on (and what
// "Diagnostics → Full Reset" rewinds to). YouTube's 1.0 matches the
// site's own default and avoids startling new users with mid-fast
// playback they didn't ask for. RuTube keeps its long-standing 1.5 —
// most RuTube content is bloggers/talks where the bias is welcome.
const SPEED_BOUNDS: Record<Site, SpeedBounds> = {
  youtube: { min: 0.75, max: 10.0, defaultSpeed: 1.0 },
  rutube: { min: 1.0, max: 10.0, defaultSpeed: 1.5 },
};

export function speedBoundsFor(site: Site): SpeedBounds {
  return SPEED_BOUNDS[site];
}

/**
 * The full pool of speeds the user can pick from in the Settings →
 * "Speed buttons" customisation grid. Filtered to each site's
 * `[min, max]` bounds at render time so the user never sees a value
 * the player would refuse.
 */
export const SPEED_POOL: readonly number[] = [
  0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 4,
] as const;

/**
 * Default visible speed buttons per site. Used as the initial value of
 * `Settings.speedPresets` for fresh installs.
 *
 *   - YouTube: includes 1× as the first preset so a user who has
 *     fast-forwarded a video can return to normal in a single click.
 *     Earlier 1.5–3.5 set inherited "fast-forward focus" intent from
 *     the userscript (.user.js:4007); v0.3.4 audit found casual users
 *     consistently confused by the missing 1×.
 *   - RuTube: 1–3 / 0.25 step (full range, RuTube's own player has no
 *     fine-grained speed control).
 */
const DEFAULT_PRESETS: Record<Site, readonly number[]> = {
  youtube: [1, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25],
  rutube: [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3],
};

export function defaultPresetsFor(site: Site): readonly number[] {
  return DEFAULT_PRESETS[site];
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
    speed: 'youtube-selected-speed',
  },
  rutube: {
    settings: 'rutube-speed-settings',
    speed: 'rutube-selected-speed',
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

/**
 * Feedback Worker endpoint. Worker source lives in the sibling
 * `HDRezkaSpeeds/cloudflare-worker/` package; both extensions POST to
 * the same deployed instance and the Worker routes by `app` field.
 */
export const FEEDBACK_WORKER_URL = 'https://speeds-feedback.matsiyak.workers.dev/feedback';

export const FALLBACK_CONTACT_EMAIL = 'matsiyak@gmail.com';

export const FEEDBACK_APP_ID = 'videospeeds';
