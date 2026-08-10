/**
 * Dzen (dzen.ru) support — the parts a browser smoke cannot reach.
 *
 * The live smoke proves the panel renders and survives fullscreen on a mock
 * that mirrors the real DOM. What it cannot show is the two decisions taken
 * BEFORE any of that: is this host ours at all, and is this page a video page
 * rather than the feed. Both are pure functions, so they are pinned here.
 */

import { describe, expect, it } from 'vitest';
import { defaultPresetsFor, speedBoundsFor } from '../../src/config';
import { supportsInPlayerSlider } from '../../src/discovery/selectors';
import { detectSite, isDzen } from '../../src/sites/detect';
import {
  isOptionalSite,
  originsForSite,
  SITE_HOSTS,
  SPA_BRIDGE_HOST_PATTERNS,
} from '../../src/sites/host-patterns';
import { isDzenVideoPath } from '../../src/ui/insertion';

describe('detectSite recognises Dzen, and only Dzen', () => {
  it('matches the apex and its subdomains', () => {
    expect(detectSite('dzen.ru')).toBe('dzen');
    expect(detectSite('www.dzen.ru')).toBe('dzen');
    expect(isDzen('dzen.ru')).toBe(true);
  });

  it('refuses look-alike hosts', () => {
    // Same anchoring bug class as audit C1: an `includes('dzen.ru')` check
    // would hand a phishing host the extension's storage and its panel.
    expect(detectSite('dzen.ru.evil.tld')).toBe(null);
    expect(detectSite('notdzen.ru')).toBe(null);
    expect(detectSite('mydzen.ru.example.org')).toBe(null);
    expect(isDzen('evil-dzen.ru.co')).toBe(false);
  });
});

describe('isDzenVideoPath keeps the panel off the feed', () => {
  it('accepts the viewer paths', () => {
    expect(isDzenVideoPath('/video/watch/6a673a21d29c014a1b594be3')).toBe(true);
    expect(isDzenVideoPath('/shorts/abc123')).toBe(true);
  });

  it('rejects everything else', () => {
    // Dzen's feed is wall-to-wall autoplaying preview <video> tiles. Without
    // this filter the heuristic discovery strategy promotes whichever tile is
    // on screen and drops the panel into the feed — the same failure RuTube's
    // channel pages produced before its own allow-list.
    for (const path of ['/', '/video', '/news', '/id/12345', '/a/some-article']) {
      expect(isDzenVideoPath(path), path).toBe(false);
    }
  });
});

describe('Dzen is wired into every site-keyed table', () => {
  it('has speed bounds and presets of its own', () => {
    const bounds = speedBoundsFor('dzen');
    expect(bounds.defaultSpeed).toBe(1.0);
    expect(bounds.min).toBeGreaterThan(0);
    expect(bounds.max).toBeGreaterThan(bounds.min);
    expect(defaultPresetsFor('dzen').length).toBeGreaterThan(0);
    // A fresh profile must not speed up the first video unasked — the bug that
    // shipped on RuTube for months. Same guard, new site.
    expect(defaultPresetsFor('dzen')).toContain(1);
  });

  it('offers the in-player slider, because it has a control bar', () => {
    expect(supportsInPlayerSlider('dzen')).toBe(true);
  });

  it('is an opt-in host with its own origin pair', () => {
    expect(isOptionalSite('dzen')).toBe(true);
    expect(isOptionalSite('youtube')).toBe(false);
    expect(originsForSite('dzen')).toEqual(['*://dzen.ru/*', '*://*.dzen.ru/*']);
  });

  it('gets the MAIN-world history hook, like the other React-router site', () => {
    for (const pattern of SITE_HOSTS.dzen.patterns) {
      expect(SPA_BRIDGE_HOST_PATTERNS).toContain(pattern);
    }
  });
});
