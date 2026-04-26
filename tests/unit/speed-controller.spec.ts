import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleSpeedButtonClick,
  pickInitialSpeed,
  setGlobal,
  setSpeed,
  setTemporary,
} from '../../src/speed/controller';
import { speedBoundsFor } from '../../src/config';
import { createMockContext, createMockDiscovery } from '../helpers/mock-context';

function makeVideo(): HTMLVideoElement {
  const v = document.createElement('video');
  document.body.appendChild(v);
  return v;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('setSpeed', () => {
  it('clamps within per-site bounds and persists', async () => {
    const video = makeVideo();
    const { ctx, speedStore } = await createMockContext({
      site: 'rutube',
      discovery: createMockDiscovery({ video }),
    });

    await setSpeed(ctx, 99);
    expect(video.playbackRate).toBe(speedBoundsFor('rutube').max);
    expect(speedStore.current()).toBe(speedBoundsFor('rutube').max);
  });

  it('falls back to default for NaN/Infinity', async () => {
    const video = makeVideo();
    const { ctx } = await createMockContext({
      site: 'youtube',
      discovery: createMockDiscovery({ video }),
    });

    await setSpeed(ctx, NaN);
    expect(video.playbackRate).toBe(speedBoundsFor('youtube').defaultSpeed);
  });

  it('still updates UI even if video is missing', async () => {
    const { ctx, ui, speedStore } = await createMockContext({
      site: 'youtube',
      discovery: createMockDiscovery({ video: null }),
    });

    await setSpeed(ctx, 1.5);
    expect((ui as { refreshButtons: ReturnType<typeof vi.fn> }).refreshButtons)
      .toHaveBeenCalledWith(1.5);
    expect(speedStore.current()).toBe(1.5);
  });
});

describe('setTemporary', () => {
  it('updates smart store, not current', async () => {
    const video = makeVideo();
    const { ctx, speedStore } = await createMockContext({
      site: 'youtube',
      initialSpeed: 2.0,
      discovery: createMockDiscovery({ video }),
    });

    await setTemporary(ctx, 1.5);
    expect(video.playbackRate).toBe(1.5);
    expect(speedStore.smart()).toBe(1.5);
    // current() unchanged
    expect(speedStore.current()).toBe(2.0);
  });
});

describe('setGlobal', () => {
  it('persists current, clears smart, and surfaces toast', async () => {
    const video = makeVideo();
    const { ctx, ui, speedStore } = await createMockContext({
      site: 'youtube',
      discovery: createMockDiscovery({ video }),
    });

    await speedStore.setSmart(2.5);

    await setGlobal(ctx, 1.75);

    expect(video.playbackRate).toBe(1.75);
    expect(speedStore.current()).toBe(1.75);
    expect(speedStore.smart()).toBe(null);
    expect((ui as { showNotification: ReturnType<typeof vi.fn> }).showNotification)
      .toHaveBeenCalledWith(expect.stringContaining('1.75'), 'info');
  });

  it('force-enables rememberSpeed if it was off', async () => {
    const video = makeVideo();
    const { ctx, settingsStore } = await createMockContext({
      site: 'youtube',
      initialSettings: { rememberSpeed: false },
      discovery: createMockDiscovery({ video }),
    });

    await setGlobal(ctx, 2.0);
    expect(settingsStore.getKey('rememberSpeed')).toBe(true);
  });
});

describe('handleSpeedButtonClick (debounce)', () => {
  it('single click within window -> setTemporary', async () => {
    const video = makeVideo();
    const { ctx, speedStore } = await createMockContext({
      site: 'youtube',
      discovery: createMockDiscovery({ video }),
    });

    handleSpeedButtonClick(ctx, 1.5);
    await vi.advanceTimersByTimeAsync(500);

    expect(speedStore.smart()).toBe(1.5);
    expect(speedStore.current()).toBe(speedBoundsFor('youtube').defaultSpeed);
  });

  it('two clicks within window -> setGlobal', async () => {
    const video = makeVideo();
    const { ctx, speedStore } = await createMockContext({
      site: 'youtube',
      discovery: createMockDiscovery({ video }),
    });

    handleSpeedButtonClick(ctx, 2.0);
    handleSpeedButtonClick(ctx, 2.0);
    await vi.advanceTimersByTimeAsync(500);

    expect(speedStore.current()).toBe(2.0);
    expect(speedStore.smart()).toBe(null);
  });
});

describe('pickInitialSpeed', () => {
  it('prefers smart if set', async () => {
    const { ctx, speedStore } = await createMockContext({ site: 'youtube' });
    await speedStore.setSmart(1.25);
    expect(pickInitialSpeed(ctx)).toBe(1.25);
  });

  it('uses current if rememberSpeed is on and no smart', async () => {
    const { ctx, speedStore } = await createMockContext({
      site: 'youtube',
      initialSettings: { rememberSpeed: true },
    });
    await speedStore.setCurrent(2.0);
    expect(pickInitialSpeed(ctx)).toBe(2.0);
  });

  it('falls back to per-site default if rememberSpeed is off', async () => {
    const { ctx } = await createMockContext({
      site: 'youtube',
      initialSettings: { rememberSpeed: false },
    });
    expect(pickInitialSpeed(ctx)).toBe(speedBoundsFor('youtube').defaultSpeed);
  });
});
