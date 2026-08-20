import { describe, expect, it } from 'vitest';
import { speedBoundsFor, storageKeysFor } from '../../src/config';
import { createMemoryStorageAdapter } from '../../src/storage/adapter';
import { createSpeedStore } from '../../src/storage/speed-store';

describe('SpeedStore', () => {
  describe('init()', () => {
    it('hydrates with the per-site default when storage is empty', async () => {
      const ytStore = createSpeedStore(createMemoryStorageAdapter());
      await ytStore.init('youtube');
      expect(ytStore.current()).toBe(speedBoundsFor('youtube').defaultSpeed);

      const ruStore = createSpeedStore(createMemoryStorageAdapter());
      await ruStore.init('rutube');
      expect(ruStore.current()).toBe(speedBoundsFor('rutube').defaultSpeed);
    });

    it('hydrates a numeric stored value', async () => {
      const adapter = createMemoryStorageAdapter({
        [storageKeysFor('youtube').speed]: 1.75,
      });
      const store = createSpeedStore(adapter);
      await store.init('youtube');
      expect(store.current()).toBe(1.75);
    });

    it('hydrates a stored string (legacy userscript format)', async () => {
      const adapter = createMemoryStorageAdapter({
        [storageKeysFor('rutube').speed]: '2.5',
      });
      const store = createSpeedStore(adapter);
      await store.init('rutube');
      expect(store.current()).toBe(2.5);
    });

    it('falls back to default for malformed string', async () => {
      const adapter = createMemoryStorageAdapter({
        [storageKeysFor('youtube').speed]: 'not a number',
      });
      const store = createSpeedStore(adapter);
      await store.init('youtube');
      expect(store.current()).toBe(speedBoundsFor('youtube').defaultSpeed);
    });

    it('clamps stored value above max into bounds', async () => {
      const adapter = createMemoryStorageAdapter({
        [storageKeysFor('rutube').speed]: 99,
      });
      const store = createSpeedStore(adapter);
      await store.init('rutube');
      expect(store.current()).toBe(speedBoundsFor('rutube').max);
    });

    it('clamps stored value below min into bounds', async () => {
      const adapter = createMemoryStorageAdapter({
        [storageKeysFor('youtube').speed]: 0.1,
      });
      const store = createSpeedStore(adapter);
      await store.init('youtube');
      expect(store.current()).toBe(speedBoundsFor('youtube').min);
    });
  });

  describe('access guards', () => {
    it('current() throws before init()', () => {
      const store = createSpeedStore(createMemoryStorageAdapter());
      expect(() => store.current()).toThrowError(/before init/);
    });
  });

  describe('setCurrent()', () => {
    it('updates the in-memory value synchronously and persists async', async () => {
      const adapter = createMemoryStorageAdapter();
      const store = createSpeedStore(adapter);
      await store.init('youtube');

      const promise = store.setCurrent(2.0);
      expect(store.current()).toBe(2.0); // sync read sees new value
      await promise;

      expect(await adapter.get(storageKeysFor('youtube').speed, null)).toBe(2.0);
    });

    it('clamps NaN/Infinity to default', async () => {
      const store = createSpeedStore(createMemoryStorageAdapter());
      await store.init('youtube');

      await store.setCurrent(NaN);
      expect(store.current()).toBe(speedBoundsFor('youtube').defaultSpeed);

      await store.setCurrent(Infinity);
      expect(store.current()).toBe(speedBoundsFor('youtube').defaultSpeed);
    });

    it('clamps within per-site bounds', async () => {
      const store = createSpeedStore(createMemoryStorageAdapter());
      await store.init('rutube');

      // Use a value above the 10x ceiling so the clamp upper-bound
      // kicks in regardless of any future bumps to `max`.
      await store.setCurrent(15);
      expect(store.current()).toBe(speedBoundsFor('rutube').max);

      await store.setCurrent(0.1);
      expect(store.current()).toBe(speedBoundsFor('rutube').min);
    });
  });

  describe('smart()', () => {
    it('starts as null and is not persisted', async () => {
      const store = createSpeedStore(createMemoryStorageAdapter());
      await store.init('youtube');
      expect(store.smart()).toBe(null);
    });

    it('setSmart() updates the value sync', async () => {
      const store = createSpeedStore(createMemoryStorageAdapter());
      await store.init('youtube');

      await store.setSmart(1.25);
      expect(store.smart()).toBe(1.25);

      await store.setSmart(null);
      expect(store.smart()).toBe(null);
    });

    it('setSmart() clamps within bounds', async () => {
      const store = createSpeedStore(createMemoryStorageAdapter());
      await store.init('rutube');
      await store.setSmart(99);
      expect(store.smart()).toBe(speedBoundsFor('rutube').max);
    });
  });
});

describe('SpeedStore per-content memory (FEAT-015)', () => {
  it('parks a speed chosen before the key resolves and writes it once it does', async () => {
    const adapter = createMemoryStorageAdapter();
    const store = createSpeedStore(adapter);
    await store.init('youtube');

    // Key not known yet — YouTube has not rendered the channel link.
    await store.rememberForActive(2);
    expect(store.activeMemory()).toBeNull();

    store.setActiveMemoryKey('yt:@somechannel');
    await Promise.resolve();
    expect(store.activeMemory()).toBe(2);
  });

  it('drops the parked speed on navigation so it cannot leak into the next channel', async () => {
    const store = createSpeedStore(createMemoryStorageAdapter());
    await store.init('youtube');

    await store.rememberForActive(2);
    store.resetPendingMemory();
    store.setActiveMemoryKey('yt:@othechannel');
    await Promise.resolve();
    expect(store.activeMemory()).toBeNull();
  });
});
