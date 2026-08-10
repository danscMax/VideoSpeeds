/**
 * Shorts remembers its own speed, separately from watch pages.
 *
 * The bug this closes (user report 2026-08-10): the panel has no anchor in the
 * Shorts layout, so it is removed there — but the remembered speed was still
 * applied. Someone who keeps regular videos at 2x landed in Shorts already sped
 * up, with no visible control at all. A separate storage bucket means Shorts
 * starts at the site default and keeps whatever is chosen there.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { storageKeysFor } from '../../src/config';
import { createSpeedStore } from '../../src/storage/speed-store';

/** Minimal in-memory StorageAdapter — records what key each value landed on. */
function makeAdapter() {
  const data = new Map<string, unknown>();
  return {
    data,
    async get<T>(key: string, fallback: T): Promise<T> {
      return data.has(key) ? (data.get(key) as T) : fallback;
    },
    async set(key: string, value: unknown): Promise<void> {
      data.set(key, value);
    },
    async remove(key: string): Promise<void> {
      data.delete(key);
    },
  };
}

describe('speed store surfaces', () => {
  let adapter: ReturnType<typeof makeAdapter>;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  it('keeps the watch-page speed out of Shorts', async () => {
    const watch = createSpeedStore(adapter);
    await watch.init('youtube');
    await watch.setCurrent(2);
    expect(watch.current()).toBe(2);

    const shorts = createSpeedStore(adapter);
    await shorts.init('youtube', 'shorts');
    // The whole point: 2x does not follow the viewer into Shorts.
    expect(shorts.current()).toBe(1);
  });

  it('remembers a speed chosen inside Shorts, without touching watch pages', async () => {
    const shorts = createSpeedStore(adapter);
    await shorts.init('youtube', 'shorts');
    await shorts.setCurrent(1.5);

    const again = createSpeedStore(adapter);
    await again.init('youtube', 'shorts');
    expect(again.current()).toBe(1.5);

    const watch = createSpeedStore(adapter);
    await watch.init('youtube');
    expect(watch.current()).toBe(1);
  });

  it('writes to a distinct key, not a shared one', async () => {
    // Guards the mechanism rather than the symptom: were the key ever shared,
    // both assertions above would still pass for the wrong reason if the
    // default happened to match.
    const shorts = createSpeedStore(adapter);
    await shorts.init('youtube', 'shorts');
    await shorts.setCurrent(3);
    const base = storageKeysFor('youtube').speed;
    expect([...adapter.data.keys()]).toContain(`${base}:shorts`);
    expect(adapter.data.get(base)).toBeUndefined();
  });
});
