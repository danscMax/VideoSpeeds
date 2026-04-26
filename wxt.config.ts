import { defineConfig } from 'wxt';
import pkg from './package.json' with { type: 'json' };

// WXT config: builds Chrome MV3 + Firefox MV3 from the same source.
// Browser-specific manifest tweaks are handled via the `manifest` callback below.
//
// See docs/MIGRATION.md for the TM-userscript -> extension data path.
// See docs/CAVEATS.md for build/dev/cross-browser constraints.
//
// Two content scripts are declared (in src/entrypoints/):
//   - content (isolated world): main logic, has chrome.* APIs
//   - page-world (MAIN world): runs in page context, can patch
//     history.pushState etc.
//
// MAIN-world strategy (audit C4, locked Wave 1.0d, 2026-04-26):
//   We use the declarative `world: 'MAIN'` content_script. WXT 0.20 emits it
//   into both chrome-mv3 and firefox-mv3 manifests verbatim. Chromium has
//   supported it since Chrome 95; Firefox added declarative MAIN-world in
//   Firefox 128 (Aug 2024).
//
//   Fallback if Firefox proves to silently drop world:'MAIN' in real-world
//   testing (Wave 4 web-ext smoke): switch page-world to an unlisted script
//   injected via `injectScript()` from `wxt/utils/inject-script` (already
//   shipped in WXT 0.20.25). That requires moving the entrypoint out of
//   `*.content.ts` and registering it under `web_accessible_resources`.
//   Plan covers the migration path; this commit deliberately does not
//   pre-commit to either side until Wave 4 has hard data.
export default defineConfig({
  srcDir: 'src',
  // Mirror pkg.version into the bundle so SCRIPT_VERSION (which keys the
  // SelectorCache via script_version) is bumped automatically when
  // package.json is bumped. Without this, version was hardcoded twice
  // (here + index.ts fallback) and the cache happily served stale
  // selectors across releases. See discovery/cache.ts:hydrate.
  vite: () => ({
    define: {
      __VS_VERSION__: JSON.stringify(pkg.version),
    },
  }),
  manifest: ({ browser }) => ({
    name: 'Video Speed Controller (YouTube + RuTube)',
    description:
      'Adds speed buttons, slider, and hotkeys to YouTube and RuTube videos. Bilingual interface (English/Russian).',
    version: pkg.version,
    permissions: ['storage'],
    // Product scope is YouTube + RuTube. Audit H5 dropped the *.piped.video
    // host that an earlier scaffold included -- it was out of product scope
    // and would have read as CWS overreach during listing review.
    host_permissions: [
      '*://*.youtube.com/*',
      '*://rutube.ru/*',
      '*://*.rutube.ru/*',
    ],
    // Firefox needs explicit ID for AMO submission and storage isolation.
    // data_collection_permissions is required for all new AMO extensions
    // since 2025-11-03 (Mozilla mandate). We don't transmit any personal
    // data, so we declare 'none'. See docs/MIGRATION.md for the storage
    // boundary that justifies the 'none' claim.
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'video-speeds@maxscorpy',
              strict_min_version: '109.0',
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
    // Icons intentionally omitted for Wave 1 dev — Chrome will use a default
    // puzzle-piece icon. Real icons are produced and wired in Wave 5 (store
    // assets) before publishing.
    action: {
      default_popup: 'popup.html',
      default_title: 'Video Speed Controller',
    },
  }),
});
