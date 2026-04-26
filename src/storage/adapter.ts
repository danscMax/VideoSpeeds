/**
 * Thin promise-based wrapper over `browser.storage.local`.
 *
 * Two impls live here:
 *   - createBrowserStorageAdapter()  -- production. Talks to wxt/browser.
 *   - createMemoryStorageAdapter()   -- tests + popup preview. Pure Map.
 *
 * Anything above this layer (SettingsStore, SpeedStore, SelectorCache,
 * migration) takes a `StorageAdapter` instance so tests can swap in a
 * deterministic backend without monkey-patching globals.
 */

import { browser } from 'wxt/browser';

export interface StorageAdapter {
  /** Resolve to the stored value, or `defaultValue` if the key is absent. */
  get<T>(key: string, defaultValue: T): Promise<T>;
  /** Persist value. Resolves once the write is committed. */
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export function createBrowserStorageAdapter(): StorageAdapter {
  // browser.storage.local works for both Chrome MV3 and Firefox MV3 via WXT's
  // unified `browser` shim. No callbacks-vs-promises ceremony needed.
  const store = browser.storage.local;

  return {
    async get<T>(key: string, defaultValue: T): Promise<T> {
      const result = await store.get(key);
      const v = (result as Record<string, unknown>)[key];
      return v === undefined ? defaultValue : (v as T);
    },
    async set(key: string, value: unknown): Promise<void> {
      await store.set({ [key]: value });
    },
    async remove(key: string): Promise<void> {
      await store.remove(key);
    },
  };
}

export function createMemoryStorageAdapter(
  initial?: Record<string, unknown>,
): StorageAdapter {
  const map = new Map<string, unknown>(
    initial ? Object.entries(initial) : undefined,
  );
  return {
    async get<T>(key: string, defaultValue: T): Promise<T> {
      return map.has(key) ? (map.get(key) as T) : defaultValue;
    },
    async set(key: string, value: unknown): Promise<void> {
      map.set(key, value);
    },
    async remove(key: string): Promise<void> {
      map.delete(key);
    },
  };
}
