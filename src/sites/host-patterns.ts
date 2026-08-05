/**
 * The one list of hosts this extension may run on.
 *
 * Single source of truth consumed by:
 *   - wxt.config.ts            -> manifest host_permissions (build time)
 *   - entrypoints/content.ts   -> content script `matches` (build time)
 *   - entrypoints/background.ts-> the "no access" toolbar warning
 *   - entrypoints/popup        -> the grant banner
 *   - entrypoints/welcome      -> the grant block on first run
 *
 * It used to be spelled out three times, and the permission checks read it
 * back out of the manifest at runtime — which quietly made them untestable:
 * a build with the manifest key removed disabled the check instead of
 * tripping it. Mirrors the twin's src/sites/mirror-hosts.ts.
 *
 * IMPORTANT: imported from `wxt.config.ts`, which Node evaluates at build
 * time. Keep it pure data — no `wxt/browser` imports, no browser globals.
 */

export const SUPPORTED_HOST_PATTERNS: readonly string[] = [
  '*://*.youtube.com/*',
  '*://rutube.ru/*',
  '*://*.rutube.ru/*',
] as const;

/** Mutable copy — the WebExtension APIs take plain string[]. */
export function supportedOrigins(): string[] {
  return [...SUPPORTED_HOST_PATTERNS];
}

/**
 * The same patterns, grouped by the SITE they belong to.
 *
 * YouTube and RuTube are independent: access to one is enough for the extension
 * to be useful, so "do we have permission" is a question per site, not one
 * question over every pattern at once. Asking it flat made the toolbar warning
 * fire when one site was granted and the other was not — a warning that is
 * usually wrong teaches people to ignore it.
 *
 * Derived from the single list above rather than written out again, so a host
 * added there cannot be forgotten here.
 */
export function supportedOriginGroups(): string[][] {
  const groups = new Map<string, string[]>();
  for (const pattern of SUPPORTED_HOST_PATTERNS) {
    // '*://*.youtube.com/*' -> 'youtube.com'
    const host = pattern.replace(/^\*:\/\/(\*\.)?/, '').replace(/\/\*$/, '');
    const existing = groups.get(host);
    if (existing) existing.push(pattern);
    else groups.set(host, [pattern]);
  }
  return [...groups.values()];
}
