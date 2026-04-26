import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStorageAdapter } from '../../src/storage/adapter';
import { createSettingsStore } from '../../src/storage/settings-store';
import { createSpeedStore } from '../../src/storage/speed-store';
import { runTmMigration } from '../../src/storage/migration-tm';
import { storageKeysFor, TM_MIGRATION_FLAG } from '../../src/config';
import type { Settings } from '../../src/storage/types';

const ytKeys = storageKeysFor('youtube');

function setLs(key: string, value: string): void {
  localStorage.setItem(key, value);
}

describe('runTmMigration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('imports settings + speed from page localStorage on first run', async () => {
    setLs(
      ytKeys.settings,
      JSON.stringify({
        sliderPosition: 'bottom',
        rememberSpeed: false,
        language: 'ru',
      }),
    );
    setLs(ytKeys.speed, '2.0');

    const adapter = createMemoryStorageAdapter();
    const settingsStore = createSettingsStore(adapter);
    const speedStore = createSpeedStore(adapter);
    await settingsStore.init('youtube');
    await speedStore.init('youtube');

    const result = await runTmMigration('youtube', settingsStore, speedStore);

    expect(result.imported).toBe(true);
    expect(result.importedKeys).toEqual(
      expect.arrayContaining([ytKeys.settings, ytKeys.speed]),
    );
    expect(settingsStore.getKey('sliderPosition')).toBe('bottom');
    expect(settingsStore.getKey('rememberSpeed')).toBe(false);
    expect(settingsStore.getKey('language')).toBe('ru');
    expect(speedStore.current()).toBe(2.0);
    expect(settingsStore.getKey(TM_MIGRATION_FLAG as keyof Settings)).toBe(true);
  });

  it('marks the flag even when nothing was found', async () => {
    const adapter = createMemoryStorageAdapter();
    const settingsStore = createSettingsStore(adapter);
    const speedStore = createSpeedStore(adapter);
    await settingsStore.init('youtube');
    await speedStore.init('youtube');

    const result = await runTmMigration('youtube', settingsStore, speedStore);
    expect(result.imported).toBe(false);
    expect(result.importedKeys).toEqual([]);
    expect(settingsStore.getKey(TM_MIGRATION_FLAG as keyof Settings)).toBe(true);
  });

  it('is a no-op on a second call (flag short-circuit)', async () => {
    setLs(ytKeys.speed, '1.5');

    const adapter = createMemoryStorageAdapter({
      [ytKeys.settings]: { __migrated_from_tm: true },
    });
    const settingsStore = createSettingsStore(adapter);
    const speedStore = createSpeedStore(adapter);
    await settingsStore.init('youtube');
    await speedStore.init('youtube');

    const result = await runTmMigration('youtube', settingsStore, speedStore);
    expect(result.imported).toBe(false);
    expect(result.importedKeys).toEqual([]);
    // Speed should NOT have been changed by the migration since it was a no-op.
    expect(speedStore.current()).not.toBe(1.5);
  });

  it('records errors when localStorage settings JSON is malformed', async () => {
    setLs(ytKeys.settings, '{not valid json}');

    const adapter = createMemoryStorageAdapter();
    const settingsStore = createSettingsStore(adapter);
    const speedStore = createSpeedStore(adapter);
    await settingsStore.init('youtube');
    await speedStore.init('youtube');

    const result = await runTmMigration('youtube', settingsStore, speedStore);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain(ytKeys.settings);
    // Flag still set so we don't re-attempt and re-error every load.
    expect(settingsStore.getKey(TM_MIGRATION_FLAG as keyof Settings)).toBe(true);
  });

  it('imports speed even when settings is absent', async () => {
    setLs(ytKeys.speed, '1.25');

    const adapter = createMemoryStorageAdapter();
    const settingsStore = createSettingsStore(adapter);
    const speedStore = createSpeedStore(adapter);
    await settingsStore.init('youtube');
    await speedStore.init('youtube');

    const result = await runTmMigration('youtube', settingsStore, speedStore);
    expect(result.imported).toBe(true);
    expect(result.importedKeys).toEqual([ytKeys.speed]);
    expect(speedStore.current()).toBe(1.25);
  });

  it('only touches the requested site even with cross-site keys present', async () => {
    setLs(storageKeysFor('rutube').speed, '2.5');
    setLs(ytKeys.speed, '1.5');

    const adapter = createMemoryStorageAdapter();
    const settingsStore = createSettingsStore(adapter);
    const speedStore = createSpeedStore(adapter);
    await settingsStore.init('youtube');
    await speedStore.init('youtube');

    const result = await runTmMigration('youtube', settingsStore, speedStore);
    expect(result.importedKeys).toContain(ytKeys.speed);
    expect(result.importedKeys).not.toContain(storageKeysFor('rutube').speed);
    expect(speedStore.current()).toBe(1.5);
  });
});
