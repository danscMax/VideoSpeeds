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
