/**
 * SettingsStore -- hydrated sync getters, async write-through (audit C1).
 *
 *   bootstrap(ctx) does `await ctx.settingsStore.init(site)` exactly once.
 *   After that, every hot path (ratechange, hotkey listener, click handler,
 *   ui render) reads via `get()` / `getKey()` synchronously. Writes go
 *   through `update()` and persist asynchronously; callers don't await on
 *   the hot path, the next read stays consistent thanks to the in-memory
 *   mirror updated synchronously inside `update()`.
 */

import { storageKeysFor } from '../config';
import type { Site } from '../app/ports';
import type { StorageAdapter } from './adapter';
import { normalizeHotkeys } from './hotkey-migrate';
import { defaultSettings, type Settings } from './types';
import { detectBrowserLang } from '../i18n/detect';
import { SUPPORTED_LANGS, type Lang } from '../i18n/dict';

export interface SettingsStoreImpl {
  init(site: Site): Promise<void>;
  get(): Settings;
  getKey<K extends keyof Settings>(key: K): Settings[K];
  update(patch: Partial<Settings>): Promise<void>;
  subscribe(fn: (next: Settings) => void): () => void;
  /** Test/internal: clear the persisted settings for this site. */
  reset(): Promise<void>;
}

export function createSettingsStore(adapter: StorageAdapter): SettingsStoreImpl {
  let state: Settings | null = null;
  let storageKey: string | null = null;
  const subscribers = new Set<(next: Settings) => void>();

  function requireInit(): Settings {
    if (state === null) {
      throw new Error('SettingsStore: get() called before init()');
    }
    return state;
  }

  function notify(): void {
    if (state === null) return;
    const snapshot = state;
    for (const fn of subscribers) {
      try { fn(snapshot); } catch { /* swallow per subscriber */ }
    }
  }

  return {
    async init(site: Site): Promise<void> {
      storageKey = storageKeysFor(site).settings;
      const fallback = defaultSettings(detectBrowserLang());
      const raw = await adapter.get<Partial<Settings> | null>(storageKey, null);

      // Build the live state by merging defaults with whatever made it through.
      // Each field is sanity-checked against its expected shape so a corrupt
      // disk write (or a TM migration of a third-party tool) can't poison
      // the in-memory state with stray strings/numbers.
      state = mergeAndValidate(raw, fallback);
    },

    get(): Settings {
      return requireInit();
    },

    getKey<K extends keyof Settings>(key: K): Settings[K] {
      return requireInit()[key];
    },

    async update(patch: Partial<Settings>): Promise<void> {
      const current = requireInit();
      // Sanitize incoming patch before merge -- update() is reachable from
      // the import-settings flow (user-supplied JSON) and from the TM-
      // migration scan; both can carry partly malformed sub-shapes.
      // Trusted UI callers pay a tiny validation tax for a meaningful
      // safety net (audit M11).
      const safe = sanitizePatch(patch);
      // Defensive copy so callers can't mutate the previous snapshot held
      // by subscribers after this returns.
      state = { ...current, ...safe };
      notify();
      if (storageKey) {
        await adapter.set(storageKey, state);
      }
    },

    subscribe(fn): () => void {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },

    async reset(): Promise<void> {
      if (storageKey) {
        await adapter.remove(storageKey);
      }
      state = defaultSettings(detectBrowserLang());
      notify();
    },
  };
}

function mergeAndValidate(
  raw: Partial<Settings> | null,
  defaults: Settings,
): Settings {
  return { ...defaults, ...sanitizePatch(raw, defaults) };
}

/**
 * Validate an arbitrary patch and return ONLY the keys that pass per-field
 * shape checks. Used by both `init` (merging into defaults) and `update`
 * (merging into the live state).
 *
 * Defensive against:
 *   - null / non-object inputs (typeof null === 'object' was the classic
 *     trap; explicit guards now)
 *   - top-level arrays that masquerade as records (typeof [] === 'object')
 *   - prototype-pollution shaped keys (`__proto__`, `constructor`,
 *     `prototype`) -- modern JSON.parse already strips `__proto__` but we
 *     belt-and-suspender it for any raw-object source (e.g. tests, future
 *     adapters)
 *   - corrupt sub-shapes (hotkeys === "x", language === 42, etc.) --
 *     each field falls back to its default independently rather than
 *     dragging the whole record down (audit M11).
 *
 * Note: the `defaults` arg is only consulted for the nested `hotkeys`
 * field where `normalizeHotkeys` needs a fallback per-action array. All
 * other fields are validated standalone -- caller spreads onto its own
 * baseline.
 */
function sanitizePatch(
  raw: unknown,
  defaults: Settings = ARRAY_FALLBACK_DEFAULTS,
): Partial<Settings> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  // Defensive snapshot: copy own enumerable string keys only, drop any
  // proto-pollution-shaped keys upfront. JSON.parse already does this in
  // modern engines; explicit defense for foreign call sites.
  const safe: Record<string, unknown> = Object.create(null);
  for (const k of Object.keys(raw as object)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    safe[k] = (raw as Record<string, unknown>)[k];
  }

  const out: Partial<Settings> = {};

  if (safe.sliderPosition === 'right' || safe.sliderPosition === 'bottom' || safe.sliderPosition === 'video') {
    out.sliderPosition = safe.sliderPosition;
  }
  if (typeof safe.rememberSpeed === 'boolean') out.rememberSpeed = safe.rememberSpeed;
  if (typeof safe.hidePlayerTitle === 'boolean') out.hidePlayerTitle = safe.hidePlayerTitle;
  if (typeof safe.hidePremium === 'boolean') out.hidePremium = safe.hidePremium;
  if (typeof safe.language === 'string' && (SUPPORTED_LANGS as readonly string[]).includes(safe.language)) {
    out.language = safe.language as Lang;
  }
  if (safe.hotkeys && typeof safe.hotkeys === 'object' && !Array.isArray(safe.hotkeys)) {
    const hk = safe.hotkeys as { speedUp?: unknown; speedDown?: unknown };
    out.hotkeys = {
      speedUp:   normalizeHotkeys(hk.speedUp,   defaults.hotkeys.speedUp),
      speedDown: normalizeHotkeys(hk.speedDown, defaults.hotkeys.speedDown),
    };
  }
  if (safe.__migrated_from_tm === true) out.__migrated_from_tm = true;

  return out;
}

// Last-ditch fallback hotkey defaults consulted only when a raw patch is
// validated WITHOUT a real `defaults` (sanitizePatch's update-path call).
// Mirrors `defaultSettings(...)` in storage/types.ts but inlined here so
// the validator can stand alone in tests.
const ARRAY_FALLBACK_DEFAULTS: Settings = {
  sliderPosition: 'right',
  rememberSpeed: true,
  hidePlayerTitle: false,
  hidePremium: false,
  language: 'en' as Lang,
  hotkeys: {
    speedUp:   [{ ctrl: true, shift: false, alt: false, meta: false, key: 'KeyC' }],
    speedDown: [{ ctrl: true, shift: false, alt: false, meta: false, key: 'KeyV' }],
  },
};
