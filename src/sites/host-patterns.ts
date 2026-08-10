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

import type { Site } from '../app/ports';

/**
 * The one table: every site, its match patterns, and whether the browser is
 * asked for it at install time.
 *
 * Keyed by `Site`, so the compiler refuses a new site that forgot its hosts —
 * the same guarantee `SPEED_BOUNDS` and the selector table already give. Every
 * list below is DERIVED from this; nothing re-types a pattern.
 */
export interface SiteHosts {
  readonly patterns: readonly string[];
  /** Opt-in: kept out of host_permissions so an update cannot disable installs. */
  readonly optional: boolean;
  /**
   * Needs the MAIN-world history hook: the site's router patches
   * history.pushState in page context and fires no event the isolated world
   * can hear. YouTube is false — Trusted Types blocks MAIN-world scripts
   * there, and yt-navigate-finish crosses the boundary by itself.
   */
  readonly spaBridge: boolean;
}

export const SITE_HOSTS: Record<Site, SiteHosts> = {
  youtube: { patterns: ['*://*.youtube.com/*'], optional: false, spaBridge: false },
  rutube: {
    patterns: ['*://rutube.ru/*', '*://*.rutube.ru/*'],
    optional: false,
    spaBridge: true,
  },
  dzen: { patterns: ['*://dzen.ru/*', '*://*.dzen.ru/*'], optional: true, spaBridge: true },
};

const entries = (): SiteHosts[] => Object.values(SITE_HOSTS);

const patternsWhere = (optional: boolean): readonly string[] =>
  entries()
    .filter((s) => s.optional === optional)
    .flatMap((s) => [...s.patterns]);

export const SUPPORTED_HOST_PATTERNS: readonly string[] = patternsWhere(false);

/** The patterns for ONE site — what the popup grants when you are on it. */
export function originsForSite(site: Site): string[] {
  return [...SITE_HOSTS[site].patterns];
}

/** True when this site is opt-in, i.e. not granted by installing. */
export function isOptionalSite(site: Site): boolean {
  return SITE_HOSTS[site].optional;
}

/**
 * Hosts the extension can work on but does NOT ask for at install time.
 *
 * Why these are optional rather than added to the list above: in Chrome a new
 * REQUIRED host permission is a permission increase, and an update carrying one
 * leaves the extension DISABLED on every existing install until the user walks
 * into chrome://extensions and re-accepts it. Trading a working install for a
 * site most of those users may never visit is a bad deal — the whole Chrome
 * audience is a couple of dozen people. Optional keeps every install alive and
 * costs one "Allow" click from whoever actually opens the site.
 *
 * The grant path already exists for Firefox, which never auto-grants under MV3:
 * the welcome page's permission block, the popup banner, and the toolbar "!"
 * badge. Optional hosts reuse it rather than inventing a second flow.
 */
export const OPTIONAL_HOST_PATTERNS: readonly string[] = patternsWhere(true);

/** Mutable copy — the WebExtension APIs take plain string[]. */
export function supportedOrigins(): string[] {
  return [...SUPPORTED_HOST_PATTERNS];
}

/** Mutable copy of the opt-in hosts, for `optional_host_permissions`. */
export function optionalOrigins(): string[] {
  return [...OPTIONAL_HOST_PATTERNS];
}

/**
 * Everything the content script may be injected into — required AND optional.
 *
 * A content script declared for an optional host simply does not run until the
 * permission is granted, which is the behaviour we want: no second registration
 * path, no `scripting.registerContentScripts` at runtime.
 */
export function allMatchPatterns(): string[] {
  return [...SUPPORTED_HOST_PATTERNS, ...OPTIONAL_HOST_PATTERNS];
}

/**
 * Hosts that need the MAIN-world history hook (entrypoints/page-world.content.ts).
 *
 * These are the React-router sites: they patch `history.pushState` in page
 * context and fire no DOM event we could hear from the isolated world, so the
 * panel would survive exactly one video and then sit on stale DOM.
 *
 * YouTube is deliberately absent — its Trusted Types CSP blocks MAIN-world
 * content scripts, and it does not need one: `yt-navigate-finish` is a
 * CustomEvent that crosses the world boundary on its own.
 */
export const SPA_BRIDGE_HOST_PATTERNS: readonly string[] = entries()
  .filter((s) => s.spaBridge)
  .flatMap((s) => [...s.patterns]);

export function spaBridgeOrigins(): string[] {
  return [...SPA_BRIDGE_HOST_PATTERNS];
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
  // One group per REQUIRED site, straight off the table. Optional sites are
  // excluded on purpose: the badge answers "can the extension do its job at
  // all", and a site nobody opted into must not make it shout.
  return entries()
    .filter((s) => !s.optional)
    .map((s) => [...s.patterns]);
}
