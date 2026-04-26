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
      // Defensive copy so callers can't mutate the previous snapshot held by
      // subscribers after this returns.
      state = { ...current, ...patch };
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
  if (!raw || typeof raw !== 'object') return defaults;

  // Merge each field individually so a corrupt sub-shape (e.g. hotkeys = "x")
  // falls back to defaults for that field only, not the whole record.
  const merged: Settings = { ...defaults };

  if (raw.sliderPosition === 'right' || raw.sliderPosition === 'bottom' || raw.sliderPosition === 'video') {
    merged.sliderPosition = raw.sliderPosition;
  }
  if (typeof raw.rememberSpeed === 'boolean') {
    merged.rememberSpeed = raw.rememberSpeed;
  }
  if (typeof raw.hidePlayerTitle === 'boolean') {
    merged.hidePlayerTitle = raw.hidePlayerTitle;
  }
  if (typeof raw.hidePremium === 'boolean') {
    merged.hidePremium = raw.hidePremium;
  }
  if (typeof raw.language === 'string' && (SUPPORTED_LANGS as readonly string[]).includes(raw.language)) {
    merged.language = raw.language as Lang;
  }
  if (raw.hotkeys && typeof raw.hotkeys === 'object') {
    merged.hotkeys = {
      speedUp:   normalizeHotkeys(raw.hotkeys.speedUp,   defaults.hotkeys.speedUp),
      speedDown: normalizeHotkeys(raw.hotkeys.speedDown, defaults.hotkeys.speedDown),
    };
  }
  if (raw.__migrated_from_tm === true) {
    merged.__migrated_from_tm = true;
  }

  return merged;
}
