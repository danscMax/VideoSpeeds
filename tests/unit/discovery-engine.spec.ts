import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSelectorCache } from '../../src/discovery/cache';
import { createDiscoveryEngine } from '../../src/discovery/engine';
import { Validators } from '../../src/discovery/validators';
import { createMemoryStorageAdapter } from '../../src/storage/adapter';

const VERSION = '1.0.0';

async function makeEngine(opts: { isFullChainEnabled?: () => boolean } = {}) {
  const adapter = createMemoryStorageAdapter();
  const cache = createSelectorCache(adapter, {
    scriptVersion: VERSION,
    host: 'test.example.com',
  });
  await cache.hydrate();
  const engine = createDiscoveryEngine({
    site: 'youtube',
    cache,
    validators: Validators,
    isFullChainEnabled: opts.isFullChainEnabled,
  });
  return { adapter, cache, engine };
}

beforeEach(() => {
  document.body.innerHTML = '';
  // Default: stub generous geometry so validators don't reject by size.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 800,
    height: 450,
    top: 0,
    left: 0,
    right: 800,
    bottom: 450,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('DiscoveryEngine.resolve', () => {
  describe('Strategy 2 (exact)', () => {
    it('finds a video by the per-site exact selector', async () => {
      const v = document.createElement('video');
      v.className = 'html5-main-video';
      document.body.appendChild(v);

      const { engine } = await makeEngine();
      const result = engine.resolve('video');

      expect(result).not.toBe(null);
      expect(result!.element).toBe(v);
      expect(result!.source).toBe('exact');
    });

    it('caches the exact match for next call', async () => {
      const v = document.createElement('video');
      v.className = 'html5-main-video';
      document.body.appendChild(v);

      const { engine, cache } = await makeEngine();
      engine.resolve('video');

      expect(cache.get('video')?.source).toBe('exact');
    });
  });

  describe('Strategy 1 (cache)', () => {
    it('uses cached selector on second resolve', async () => {
      const v = document.createElement('video');
      v.className = 'html5-main-video';
      document.body.appendChild(v);

      const { engine } = await makeEngine();
      engine.resolve('video');
      const result = engine.resolve('video');

      expect(result?.source).toBe('cache');
    });

    it('falls through to exact on cache miss', async () => {
      // Cache hits an entry whose selector points at nothing.
      const adapter = createMemoryStorageAdapter();
      const cache = createSelectorCache(adapter, { scriptVersion: VERSION, host: 'test.host' });
      await cache.hydrate();
      cache.set('video', {
        selector: 'video.does-not-exist',
        source: 'exact',
        confidence: 0.9,
        signature: 'old',
      });
      const v = document.createElement('video');
      v.className = 'html5-main-video';
      document.body.appendChild(v);
      const engine = createDiscoveryEngine({
        site: 'youtube',
        cache,
        validators: Validators,
      });

      const result = engine.resolve('video');
      // Cache entry was dead, exact strategy should rescue.
      expect(result?.source).toBe('exact');
      expect(result?.element).toBe(v);
    });
  });

  describe('Strategy 4 (ancestor)', () => {
    it('walks up from <video> when exact selectors miss', async () => {
      // Real player container that the per-site exact list won't match
      // (no #player-container / .html5-video-container / #movie_player).
      const wrapper = document.createElement('section');
      wrapper.className = 'mystery-class';
      const v = document.createElement('video');
      wrapper.appendChild(v);
      document.body.appendChild(wrapper);

      const { engine } = await makeEngine();
      const result = engine.resolve('playerContainer');

      expect(result).not.toBe(null);
      expect(result!.element).toBe(wrapper);
      expect(result!.source).toBe('ancestor');
    });
  });

  describe('Strategy 5 (heuristic)', () => {
    it('picks the largest <video> when exact match is rejected as preview', async () => {
      // small comes first in DOM; exact strategy hits it but the validator
      // rejects it as an autoplay preview (muted+loop+src+small width).
      // Heuristic then picks the biggest still-ready video.
      const small = document.createElement('video');
      small.src = 'blob:s';
      small.muted = true;
      small.loop = true;
      // happy-dom 20 no longer mirrors `.src` into `.currentSrc` automatically
      // — the engine's heuristic ready-check (readyState >= 1 || !!currentSrc)
      // would skip both videos. Define currentSrc explicitly so the heuristic
      // sees a "ready" element to score.
      Object.defineProperty(small, 'currentSrc', { value: 'blob:s', configurable: true });
      // Use Object.defineProperty rather than vi.spyOn — happy-dom 20 + Vitest 4
      // have a behavior shift where prototype-method spies don't intercept calls
      // routed through the underlying impl. Explicit per-instance override is
      // robust across versions.
      Object.defineProperty(small, 'getBoundingClientRect', {
        value: () =>
          ({
            width: 200,
            height: 113,
            top: 0,
            left: 0,
            right: 200,
            bottom: 113,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          }) as DOMRect,
        configurable: true,
      });

      const big = document.createElement('video');
      big.src = 'blob:b';
      Object.defineProperty(big, 'currentSrc', { value: 'blob:b', configurable: true });
      Object.defineProperty(big, 'getBoundingClientRect', {
        value: () =>
          ({
            width: 1280,
            height: 720,
            top: 0,
            left: 0,
            right: 1280,
            bottom: 720,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          }) as DOMRect,
        configurable: true,
      });

      const wrapSmall = document.createElement('aside');
      wrapSmall.appendChild(small);
      const wrapBig = document.createElement('section');
      wrapBig.appendChild(big);
      document.body.appendChild(wrapSmall);
      document.body.appendChild(wrapBig);

      const { engine } = await makeEngine();
      const result = engine.resolve('video');

      expect(result?.element).toBe(big);
      expect(result?.source).toBe('heuristic');
    });
  });

  describe('gating', () => {
    it('exactOnly skips cache + strategies 3-5', async () => {
      // No matching <video> in DOM. Exact returns null because nothing
      // matches; heuristic would normally jump in but exactOnly disables it.
      const { engine } = await makeEngine();
      const result = engine.resolve('video', { exactOnly: true });
      expect(result).toBe(null);
    });

    it('isFullChainEnabled=false halts at strategy 2', async () => {
      const { engine } = await makeEngine({ isFullChainEnabled: () => false });
      const wrapper = document.createElement('section');
      wrapper.appendChild(document.createElement('video'));
      document.body.appendChild(wrapper);
      // Without ancestor strategy, no per-site exact selector matches a
      // <section> wrapper -> resolve returns null.
      const result = engine.resolve('playerContainer');
      expect(result).toBe(null);
    });
  });

  describe('metrics', () => {
    it('records lastBySource per resolve', async () => {
      const v = document.createElement('video');
      v.className = 'html5-main-video';
      document.body.appendChild(v);
      const { engine } = await makeEngine();

      engine.resolve('video');
      expect(engine.metrics().lastBySource.video).toBe('exact');

      engine.resolve('video');
      expect(engine.metrics().lastBySource.video).toBe('cache');
    });

    it('records null when nothing resolves', async () => {
      const { engine } = await makeEngine();
      engine.resolve('video');
      expect(engine.metrics().lastBySource.video).toBe(null);
    });
  });
});
