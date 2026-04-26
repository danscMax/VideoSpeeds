import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorageAdapter } from '../../src/storage/adapter';
import { createSettingsStore } from '../../src/storage/settings-store';
import { defaultSettings } from '../../src/storage/types';
import { storageKeysFor } from '../../src/config';

describe('SettingsStore', () => {
  describe('init()', () => {
    it('hydrates from defaults when storage is empty', async () => {
      const store = createSettingsStore(createMemoryStorageAdapter());
      await store.init('youtube');

      const s = store.get();
      expect(s.sliderPosition).toBe('right');
      expect(s.rememberSpeed).toBe(true);
      expect(s.hotkeys.speedUp).toHaveLength(1);
      expect(s.hotkeys.speedUp[0]?.key).toBe('KeyC');
      expect(s.hotkeys.speedDown[0]?.key).toBe('KeyV');
    });

    it('hydrates from prior storage value', async () => {
      const adapter = createMemoryStorageAdapter({
        [storageKeysFor('youtube').settings]: {
          ...defaultSettings('en'),
          sliderPosition: 'bottom',
          rememberSpeed: false,
        },
      });
      const store = createSettingsStore(adapter);
      await store.init('youtube');

      expect(store.getKey('sliderPosition')).toBe('bottom');
      expect(store.getKey('rememberSpeed')).toBe(false);
    });

    it('falls back to defaults for individual corrupt fields', async () => {
      const adapter = createMemoryStorageAdapter({
        [storageKeysFor('rutube').settings]: {
          sliderPosition: 'INVALID',
          rememberSpeed: 'yes' as unknown as boolean,
          hotkeys: 'oops',
          language: 'klingon',
        },
      });
      const store = createSettingsStore(adapter);
      await store.init('rutube');

      const s = store.get();
      expect(s.sliderPosition).toBe('right');         // bad enum value rejected
      expect(s.rememberSpeed).toBe(true);             // bad type rejected
      expect(s.hotkeys.speedUp).toHaveLength(1);      // bad shape -> defaults
      expect(s.language === 'en' || s.language === 'ru').toBe(true);
    });

    it('preserves __migrated_from_tm flag from storage', async () => {
      const adapter = createMemoryStorageAdapter({
        [storageKeysFor('youtube').settings]: { __migrated_from_tm: true },
      });
      const store = createSettingsStore(adapter);
      await store.init('youtube');
      expect(store.getKey('__migrated_from_tm')).toBe(true);
    });
  });

  describe('access guards', () => {
    it('get() throws if init() was never called', () => {
      const store = createSettingsStore(createMemoryStorageAdapter());
      expect(() => store.get()).toThrowError(/before init/);
      expect(() => store.getKey('language')).toThrowError(/before init/);
    });
  });

  describe('update()', () => {
    it('applies the patch to the in-memory state synchronously', async () => {
      const store = createSettingsStore(createMemoryStorageAdapter());
      await store.init('youtube');

      const promise = store.update({ sliderPosition: 'video' });
      // Sync read sees the new value before the promise resolves.
      expect(store.getKey('sliderPosition')).toBe('video');
      await promise;
    });

    it('persists the patch to the adapter', async () => {
      const adapter = createMemoryStorageAdapter();
      const store = createSettingsStore(adapter);
      await store.init('rutube');

      await store.update({ rememberSpeed: false });

      const persisted = await adapter.get(
        storageKeysFor('rutube').settings,
        null,
      );
      expect(persisted).toMatchObject({ rememberSpeed: false });
    });
  });

  describe('subscribe()', () => {
    it('notifies subscribers on every update', async () => {
      const store = createSettingsStore(createMemoryStorageAdapter());
      await store.init('youtube');
      const listener = vi.fn();
      store.subscribe(listener);

      await store.update({ sliderPosition: 'bottom' });
      await store.update({ rememberSpeed: false });

      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener.mock.calls[0]?.[0].sliderPosition).toBe('bottom');
      expect(listener.mock.calls[1]?.[0].rememberSpeed).toBe(false);
    });

    it('returns an unsubscribe function', async () => {
      const store = createSettingsStore(createMemoryStorageAdapter());
      await store.init('youtube');
      const listener = vi.fn();
      const off = store.subscribe(listener);

      await store.update({ sliderPosition: 'video' });
      off();
      await store.update({ sliderPosition: 'bottom' });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('one throwing subscriber does not break the others', async () => {
      const store = createSettingsStore(createMemoryStorageAdapter());
      await store.init('youtube');
      const ok = vi.fn();
      store.subscribe(() => {
        throw new Error('boom');
      });
      store.subscribe(ok);

      await expect(store.update({ rememberSpeed: false })).resolves.not.toThrow();
      expect(ok).toHaveBeenCalledTimes(1);
    });
  });

  describe('reset()', () => {
    it('removes the storage key and reverts to defaults', async () => {
      const adapter = createMemoryStorageAdapter();
      const store = createSettingsStore(adapter);
      await store.init('youtube');

      await store.update({ sliderPosition: 'video' });
      await store.reset();

      expect(store.getKey('sliderPosition')).toBe('right');
      expect(
        await adapter.get(storageKeysFor('youtube').settings, 'gone'),
      ).toBe('gone');
    });
  });

  describe('per-site key isolation', () => {
    it('writes go to the site-specific key', async () => {
      const adapter = createMemoryStorageAdapter();
      const store = createSettingsStore(adapter);
      await store.init('rutube');
      await store.update({ sliderPosition: 'bottom' });

      // YouTube key untouched.
      expect(
        await adapter.get(storageKeysFor('youtube').settings, null),
      ).toBe(null);
      // RuTube key has the value.
      expect(
        await adapter.get(storageKeysFor('rutube').settings, null),
      ).toMatchObject({ sliderPosition: 'bottom' });
    });
  });
});
