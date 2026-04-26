import { describe, expect, it } from 'vitest';
import { ICON_NAMES, vsIcon } from '../../src/ui/icons';

describe('vsIcon()', () => {
  it('emits a well-formed SVG with the requested size', () => {
    const out = vsIcon('settings', 16);
    expect(out).toMatch(/^<svg /);
    expect(out).toMatch(/<\/svg>$/);
    expect(out).toContain('width="16"');
    expect(out).toContain('height="16"');
    expect(out).toContain('viewBox="0 0 24 24"');
    expect(out).toContain('stroke="currentColor"');
  });

  it('defaults size to 14', () => {
    expect(vsIcon('plus')).toContain('width="14"');
    expect(vsIcon('plus')).toContain('height="14"');
  });

  it('returns empty SVG (just attributes) for unknown name', () => {
    // Cast bypasses the union to simulate a runtime typo.
    const out = vsIcon('not-a-real-icon' as unknown as 'plus');
    expect(out).toContain('<svg');
    expect(out).toContain('></svg>');
  });

  it('exposes ICON_NAMES with the full set ported from the userscript', () => {
    // 23 icons: 22 from the original userscript + globe added for the
    // language switcher (Wave 1.8a will use it in the General tab).
    expect(ICON_NAMES.length).toBe(23);
    expect(ICON_NAMES).toContain('globe');
    expect(ICON_NAMES).toContain('settings');
  });

  it('every icon name renders without throwing', () => {
    for (const name of ICON_NAMES) {
      expect(() => vsIcon(name)).not.toThrow();
      expect(vsIcon(name)).toMatch(/^<svg /);
    }
  });
});
