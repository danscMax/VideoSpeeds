import { defineConfig } from 'wxt';
import pkg from './package.json' with { type: 'json' };
import { optionalOrigins, supportedOrigins } from './src/sites/host-patterns';

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
  // AMO submission: keep the source archive small and focused so the
  // reviewer doesn't need to wade through ~13 MB of test screenshots and
  // unrelated build artefacts. Mozilla policy requires the source zip to
  // contain only what's needed to reproduce the submitted bundle — store
  // listing PNGs and Playwright debug shots are not.
  zip: {
    excludeSources: [
      // Test/debug screenshots — large, not needed to reproduce the build.
      'tests/smoke/**/*.png',
      'tests/smoke/audit-shots/**',
      // Store-listing PNGs are uploaded separately to AMO/CWS as listing
      // assets; they are not source code.
      'dist-store-assets/screenshots/**',
      // The userscript artifact is a build OUTPUT (Tampermonkey distribution
      // path), not source. The .gitignore already excludes the build output
      // dir, but the file ships in dist-userscript/ explicitly so power
      // users can grab it from the repo.
      'dist-userscript/**',
      // Personal scratch notes that live untracked in the working tree —
      // not part of the source the AMO reviewer needs.
      'Ссылка для чаевых.txt',
    ],
  },
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
      'Adds speed buttons, slider, and hotkeys to YouTube, RuTube and Dzen videos. Bilingual interface (English/Russian).',
    version: pkg.version,
    author: 'MaxScorpy',
    // `activeTab` is what lets the popup see the URL of the tab you clicked
    // from. Without it `tabs.query` returns no `url` for a host we have no
    // permission for yet — so on an opt-in site the popup cannot tell which
    // site it is on and never renders the "Allow" button, making the grant
    // unreachable and the opt-in host dead on arrival. It is also the state a
    // Firefox install starts in for EVERY site.
    // Chosen over `tabs`: activeTab is scoped to the tab you invoked the
    // extension on, shows no install-time permission warning, and therefore
    // cannot disable existing installs on update.
    permissions: ['storage', 'activeTab'],
    // Product scope is YouTube + RuTube, with Dzen as an opt-in host (see
    // optional_host_permissions below). Audit H5 dropped the *.piped.video
    // host that an earlier scaffold included -- it was out of product scope
    // and would have read as CWS overreach during listing review.
    host_permissions: supportedOrigins(),
    // Opt-in hosts (Dzen). Kept out of host_permissions so a Chrome update
    // cannot disable the extension on every existing install for a site the
    // user may never open. See src/sites/host-patterns.ts.
    optional_host_permissions: optionalOrigins(),
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
              // 140.0 is when desktop Firefox started recognizing
              // `data_collection_permissions`; Android Firefox got it in
              // 142.0. We pin to 142.0 so both platforms understand the
              // privacy declaration without AMO emitting a "key not
              // supported by minimum version" warning. Trade-off: users
              // on FF 109-141 lose access; that range is < 5% of installs
              // by 2026-04 and ESR users are unaffected (they already
              // pin to a specific channel).
              strict_min_version: '142.0',
              // Extension collects nothing automatically — settings
              // stay in browser.storage.local. The Send-feedback flow
              // is fully opt-in (user types a message, optionally
              // attaches a diagnostic snapshot, explicitly clicks
              // Submit). Mapping to AMO's data-collection schema:
              //   - required: ['none']         — nothing forced.
              //   - optional: personalCommunications (the message)
              //               + technicalAndInteraction (diag blob,
              //               only when user checks the box).
              data_collection_permissions: {
                required: ['none'],
                optional: ['personalCommunications', 'technicalAndInteraction'],
              },
            },
          },
        }
      : {}),
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    action: {
      default_popup: 'popup.html',
      // Same qualifier as the manifest name: hovering the toolbar icon should
      // say which sites this one works on — there is a sister extension for
      // HDRezka and "Video Speed Controller" alone does not tell them apart.
      default_title: 'Video Speed Controller (YouTube + RuTube)',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
      },
    },
    // Defence-in-depth for the extension's own pages (popup / welcome /
    // feedback). script-src + object-src 'self' just restate the MV3 default;
    // connect-src is the addition — the ONLY outbound connection any
    // extension page makes is the feedback POST to the Cloudflare Worker
    // (src/entrypoints/feedback/main.ts), so everything else is locked to
    // 'self'. default-src is intentionally omitted so local img/font/style
    // for welcome/popup stay unrestricted.
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'self'; connect-src 'self' https://speeds-feedback.matsiyak.workers.dev",
    },
  }),
});
