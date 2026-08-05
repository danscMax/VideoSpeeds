/**
 * The manifest is the contract with the browser, and it is BUILT from other
 * files. Nothing tested wxt.config.ts before this file, so a host added to
 * src/sites/host-patterns.ts without its consequences reaching host_permissions
 * — or a permission quietly widening — would ship unnoticed.
 */

import { describe, expect, it } from 'vitest';
import { SUPPORTED_HOST_PATTERNS } from '../../src/sites/host-patterns';
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
});

describe('permissions stay least-privilege', () => {
  it('asks for storage and nothing else', () => {
    for (const m of [chrome, firefox]) {
      expect(m.permissions).toEqual(['storage']);
      // `tabs` would add an install-time warning; the popup uses activeTab
      // semantics through the toolbar click instead.
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
