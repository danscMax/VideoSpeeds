/**
 * Dzen gets a real theme decision, not the hardcoded default.
 *
 * Found by an independent review of the Dzen change: `detectAndApplyTheme`
 * branched on 'youtube' and 'rutube' only, so a third site fell through to the
 * `let theme = 'dark'` initializer — not even the `prefers-color-scheme`
 * fallback the other two get. Dzen ships a light theme today, so that meant
 * near-white panel text on a light page. The site list is easy to forget again;
 * this pins it.
 *
 * Uses the ambient document on purpose: `detectByLuminance` reads
 * `container.defaultView` to call getComputedStyle, and a document built with
 * `createHTMLDocument` has none — it would report "dark" for every input and
 * the test would pass against the very fall-through it is meant to catch.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { detectAndApplyTheme } from '../../src/ui/styles';

afterEach(() => {
  document.body.style.backgroundColor = '';
  delete document.documentElement.dataset.vsTheme;
});

const themeFor = (background: string): string | undefined => {
  document.body.style.backgroundColor = background;
  delete document.documentElement.dataset.vsTheme;
  detectAndApplyTheme('dzen', document, document.body);
  return document.documentElement.dataset.vsTheme;
};

describe('detectAndApplyTheme on Dzen', () => {
  it('reads a light page as light', () => {
    expect(themeFor('rgb(255, 255, 255)')).toBe('light');
  });

  it('reads a dark page as dark', () => {
    expect(themeFor('rgb(19, 19, 19)')).toBe('dark');
  });

  it('does not simply answer dark for everything', () => {
    // The regression this guards is a fall-through that always yields 'dark'.
    // Asserting the pair DIFFERS is what separates a real decision from a
    // constant; either case alone would pass against the broken version.
    expect(themeFor('rgb(250, 250, 250)')).not.toBe(themeFor('rgb(16, 16, 16)'));
  });
});
