/**
 * What a brand-new profile gets. Twin of the HDRezkaSpeeds spec: the value
 * that decides how the very first video plays sat unguarded, and on RuTube it
 * was 1.5 — the first video started 50% faster with nothing on screen saying
 * why, which reads as "the extension broke the player".
 */

import { describe, expect, it } from 'vitest';
import { defaultPresetsFor, speedBoundsFor } from '../../src/config';

describe('a fresh profile plays at normal speed', () => {
  it.each(['youtube', 'rutube'] as const)('starts at 1.0 on %s', (site) => {
    expect(speedBoundsFor(site).defaultSpeed).toBe(1);
  });

  it('keeps the faster speeds one click away as presets', () => {
    // Not hiding the feature — the speed that used to be forced on first run
    // must still be sitting on the panel.
    expect(defaultPresetsFor('rutube')).toContain(1.5);
  });

  it.each(['youtube', 'rutube'] as const)('never defaults outside its bounds on %s', (site) => {
    const b = speedBoundsFor(site);
    expect(b.defaultSpeed).toBeGreaterThanOrEqual(b.min);
    expect(b.defaultSpeed).toBeLessThanOrEqual(b.max);
  });
});
