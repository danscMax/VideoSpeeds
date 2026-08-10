/**
 * The manifest is the contract with the browser, and it is BUILT from other
 * files. Nothing tested wxt.config.ts before this file, so a host added to
 * src/sites/host-patterns.ts without its consequences reaching host_permissions
 * — or a permission quietly widening — would ship unnoticed.
 */

import { describe, expect, it } from 'vitest';
import {
  allMatchPatterns,
  OPTIONAL_HOST_PATTERNS,
  SPA_BRIDGE_HOST_PATTERNS,
  SUPPORTED_HOST_PATTERNS,
  supportedOriginGroups,
} from '../../src/sites/host-patterns';
import config from '../../wxt.config';

type ManifestFn = (env: { browser: string }) => Record<string, unknown>;

const manifestFor = (browser: string): Record<string, unknown> =>
  (config.manifest as unknown as ManifestFn)({ browser });

const chrome = manifestFor('chrome');
const firefox = manifestFor('firefox');

describe('manifest is derived from the single host list', () => {
  it.each(['chrome', 'firefox'])('%s: host_permissions match the source list', (browser) => {
    expect(manifestFor(browser).host_permissions).toEqual([...SUPPORTED_HOST_PATTERNS]);
  });

  it('covers both YouTube and RuTube, apex and subdomains', () => {
    const patterns = chrome.host_permissions as string[];
    expect(patterns).toContain('*://*.youtube.com/*');
    expect(patterns).toContain('*://rutube.ru/*');
    expect(patterns).toContain('*://*.rutube.ru/*');
  });

  it.each(['chrome', 'firefox'])('%s: opt-in hosts are optional, never required', (browser) => {
    const m = manifestFor(browser);
    expect(m.optional_host_permissions).toEqual([...OPTIONAL_HOST_PATTERNS]);
    // The point of the split: a host listed here must NOT appear in
    // host_permissions. In Chrome that would be a permission increase, and an
    // update carrying one leaves the extension disabled on every existing
    // install until the user re-accepts it by hand.
    for (const pattern of OPTIONAL_HOST_PATTERNS) {
      expect(m.host_permissions as string[]).not.toContain(pattern);
    }
  });

  it('injects the content script into optional hosts too', () => {
    // Otherwise granting the permission would achieve nothing: the script has
    // to be declared for the host up front, it just stays dormant until the
    // grant lands. Both lists, no gaps.
    expect(allMatchPatterns()).toEqual([...SUPPORTED_HOST_PATTERNS, ...OPTIONAL_HOST_PATTERNS]);
  });

  it('gives every React-router site the MAIN-world history hook', () => {
    // A site whose router patches history.pushState but has no page-world hook
    // loses the panel on the first in-page navigation and shows nothing broken
    // in the console. YouTube is excluded on purpose — Trusted Types blocks
    // MAIN-world scripts there, and yt-navigate-finish crosses the boundary.
    for (const pattern of SPA_BRIDGE_HOST_PATTERNS) {
      expect(allMatchPatterns()).toContain(pattern);
    }
    expect(SPA_BRIDGE_HOST_PATTERNS).not.toContain('*://*.youtube.com/*');
  });
});

describe('the manifest fits what the stores accept', () => {
  it.each(['chrome', 'firefox'])('%s: the name fits Chrome’s 45-character cap', (browser) => {
    // Nothing checked this before, and the first attempt to advertise a third
    // site in the name produced 48 characters — Chrome rejects the package at
    // upload, after the Firefox half of a release has already gone out.
    // AMO's own limit is 50, so the tighter cap is the one worth pinning.
    const name = manifestFor(browser).name as string;
    expect(name.length, `manifest name is ${name.length} chars: "${name}"`).toBeLessThanOrEqual(45);
  });

  it('keeps the description inside Chrome’s 132-character cap', () => {
    const description = chrome.description as string;
    expect(description.length).toBeLessThanOrEqual(132);
  });
});

describe('permissions stay least-privilege', () => {
  it('asks for storage and activeTab, and nothing broader', () => {
    for (const m of [chrome, firefox]) {
      // activeTab, not tabs: `tabs` reads every tab's URL and carries an
      // install-time warning; activeTab is scoped to the tab the toolbar click
      // came from and carries none — which is why adding it cannot disable an
      // existing install. It is what makes the opt-in grant reachable at all.
      expect(m.permissions).toEqual(['storage', 'activeTab']);
      expect(m.permissions as string[]).not.toContain('tabs');
    }
  });

  it('keeps the outbound allow-list to the feedback worker only', () => {
    const csp = chrome.content_security_policy as { extension_pages?: string };
    expect(csp?.extension_pages).toContain("script-src 'self'");
    expect(csp?.extension_pages).toContain('https://speeds-feedback.matsiyak.workers.dev');
    // No wildcard escape hatch — the feedback POST is the only outbound call.
    expect(csp?.extension_pages).not.toContain('https://*');
  });

  it('ships a stable Firefox add-on id — storage and AMO updates hang off it', () => {
    const gecko = (firefox.browser_specific_settings as { gecko?: { id?: string } })?.gecko;
    expect(gecko?.id).toBe('video-speeds@maxscorpy');
    expect(chrome.browser_specific_settings).toBeUndefined();
  });
});

describe('supportedOriginGroups', () => {
  it('groups every pattern under its own site, losing none', () => {
    const groups = supportedOriginGroups();
    expect(groups.flat().sort()).toEqual([...SUPPORTED_HOST_PATTERNS].sort());
    // Two independent sites: permission to one is enough for the extension to
    // be useful, which is what the toolbar warning asks about.
    expect(groups).toHaveLength(2);
    expect(groups.some((g) => g.includes('*://*.youtube.com/*'))).toBe(true);
    const rutube = groups.find((g) => g.includes('*://rutube.ru/*'));
    expect(rutube).toContain('*://*.rutube.ru/*');
  });
});
