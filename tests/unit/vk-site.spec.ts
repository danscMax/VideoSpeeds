/**
 * VK video support — and, just as importantly, the limits it ships with.
 *
 * VK's player creates no <video> under any automated browser (headless
 * Chromium, headed real Chrome, a persistent on-disk profile, the official
 * /video_ext.php embed), so unlike every other site here its DOM was never
 * measured. The support therefore leans on the engine's heuristic strategy and
 * carries exactly one selector — the single class name VK's own stylesheet
 * gave up. These tests pin that decision so nobody "completes" the table from
 * imagination later.
 */

import { describe, expect, it } from 'vitest';
import { defaultPresetsFor, speedBoundsFor, storageKeysFor } from '../../src/config';
import { supportsInPlayerSlider } from '../../src/discovery/selectors';
import { detectSite, isVk, isVkVideoPath } from '../../src/sites/detect';
import { isOptionalSite, originsForSite, SITE_HOSTS } from '../../src/sites/host-patterns';

describe('detectSite recognises VK on both its domains', () => {
  it('matches the video domain and the social network', () => {
    expect(detectSite('vkvideo.ru')).toBe('vk');
    expect(detectSite('www.vkvideo.ru')).toBe('vk');
    expect(detectSite('vk.com')).toBe('vk');
    expect(detectSite('vk.ru')).toBe('vk');
    expect(isVk('m.vk.com')).toBe(true);
  });

  it('scopes vk.com to its video section', () => {
    // Host-only detection made the popup claim "you are on VK" on a feed page
    // where no content script had ever run, so every control it offered did
    // nothing. Given a path, the scope is applied at the single point that
    // decides what site a URL belongs to.
    expect(detectSite('vk.com', '/video-1_2')).toBe('vk');
    expect(detectSite('vk.com', '/feed')).toBe(null);
    expect(detectSite('vk.com', '/im')).toBe(null);
    // vkvideo.ru is a video-only domain, so no path scope applies there.
    expect(detectSite('vkvideo.ru', '/anything')).toBe('vk');
  });

  it('refuses look-alike hosts', () => {
    expect(detectSite('vk.com.evil.tld')).toBe(null);
    expect(detectSite('notvk.com')).toBe(null);
    expect(detectSite('vkvideo.ru.example.org')).toBe(null);
  });
});

describe('host permissions stay scoped to the video product', () => {
  it('never asks for all of vk.com', () => {
    // A speed slider asking for every page of a social network is an
    // install-time warning out of all proportion, and the kind of overreach a
    // store reviewer is right to reject.
    for (const pattern of originsForSite('vk')) {
      expect(pattern, pattern).not.toBe('*://vk.com/*');
      expect(pattern, pattern).not.toBe('*://*.vk.com/*');
    }
    expect(originsForSite('vk')).toContain('*://vk.com/video*');
    expect(originsForSite('vk')).toContain('*://vkvideo.ru/*');
  });

  it('is opt-in, like Dzen', () => {
    expect(isOptionalSite('vk')).toBe(true);
    expect(SITE_HOSTS.vk.spaBridge).toBe(true);
  });
});

describe('isVkVideoPath keeps the panel off the catalogue', () => {
  it('accepts a single video and the embed player', () => {
    expect(isVkVideoPath('/video-211232966_456241404')).toBe(true);
    expect(isVkVideoPath('/video123456_789')).toBe(true);
    expect(isVkVideoPath('/video_ext.php')).toBe(true);
  });

  it('rejects the catalogue, playlists and everything else', () => {
    // This filter carries more weight on VK than anywhere else: with almost no
    // selectors, the heuristic strategy is what finds the player, and it will
    // happily promote the biggest preview tile on a grid.
    for (const path of ['/video', '/videos123', '/playlist/-2_456', '/feed', '/']) {
      expect(isVkVideoPath(path), path).toBe(false);
    }
  });
});

describe('VK ships with its unknowns declared, not filled in', () => {
  it('does NOT offer the in-player slider', () => {
    // Not an oversight: the control bar was never measured, so the option is
    // withheld. The gate derives this from the selector table, so it flips on
    // its own the day someone adds a control-bar entry.
    expect(supportsInPlayerSlider('vk')).toBe(false);
    expect(supportsInPlayerSlider('dzen')).toBe(true);
  });

  it('still has its own bounds, presets and storage keys', () => {
    expect(speedBoundsFor('vk').defaultSpeed).toBe(1.0);
    expect(defaultPresetsFor('vk')).toContain(1);
    expect(storageKeysFor('vk').speed).toBe('vk-selected-speed');
    // Distinct from every other site — a shared key would leak one site's
    // speed onto another.
    const keys = (['youtube', 'rutube', 'dzen', 'vk'] as const).map((s) => storageKeysFor(s).speed);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
