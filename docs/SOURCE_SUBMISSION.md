# Source code submission — Video Speed Controller

This document is for the **Mozilla AMO** (addons.mozilla.org) reviewer.
Mozilla policy requires reproducible build instructions whenever the
submitted package contains minified code. Our distribution bundle does
contain minified JavaScript (`content-scripts/content.js`,
`chunks/popup-*.js`), so this file describes how to rebuild from source
and obtain bit-for-bit identical output.

## Prerequisites

- **Node.js**: 24.x (LTS works equivalently — `>=20` should reproduce).
  We test against the version printed by `node --version` at the top of
  `package.json` `engines`, when present, or against the project's
  installed Node — see `node --version` in your environment.
- **npm**: bundled with Node.
- **Operating system**: any. Reproduced on Windows 11, macOS 14, and
  Ubuntu 22.04 — the build is deterministic across platforms.

No system-level dependencies (no Python, no build toolchain, no native
modules). Everything runs through `npm`.

## Source location

- **GitHub** (canonical): tag `v<version>` on the `main` branch.
- **Submitted source archive**: the `.zip` uploaded with this submission
  contains the same tree as the GitHub tag, minus `node_modules`, build
  artefacts, and editor metadata (see `.gitignore` for the exclusion
  list).

## Build commands

```sh
# 1. Restore dependencies (locked via package-lock.json)
npm ci

# 2. Build for Firefox (MV3)
npm run build:firefox

# Output: .output/firefox-mv3/
#   - manifest.json
#   - content-scripts/content.js
#   - content-scripts/page-world.js
#   - chunks/popup-*.js
#   - assets/popup-*.css
#   - icon/{16,32,48,128}.png
#   - popup.html
```

The Chrome variant is built with `npm run build` (alias for
`wxt build`); the userscript variant — for users on Tampermonkey /
Violentmonkey, **not** part of the AMO submission — is built via
`npm run build:userscript`.

## Comparison with the submitted bundle

After running `npm run build:firefox`, compare `.output/firefox-mv3/`
against the contents of the AMO-uploaded `.zip`. They should be
byte-identical.

If a hash mismatch appears, the most common causes are:
1. Different Node version — see Prerequisites above.
2. Stale `node_modules` from a previous build — delete and re-run
   `npm ci`.
3. Local changes in the working tree — verify against the exact tag
   listed in the AMO submission notes.

## Verifying the toolchain

`package.json` and `package-lock.json` together pin the entire build
toolchain. Key entries:

- `wxt`: bundles `vite` + Chrome/Firefox-aware manifest generation
- `vite`: ES module bundler (Rollup under the hood for production)
- `vite-plugin-monkey`: only used by the userscript build, not by
  `build:firefox`
- `typescript`: compile-time type-check; emits no JavaScript
  (`tsc --noEmit`)

The build pipeline is:
1. `wxt prepare` (auto-run on `postinstall`) generates `.wxt/types/*`
   and the development manifest scaffold.
2. `wxt build -b firefox --mv3` invokes Vite once per entry point
   (`src/entrypoints/content.ts`, `src/entrypoints/page-world.ts`,
   `src/entrypoints/popup/...`) and writes the result to
   `.output/firefox-mv3/`.
3. Vite's Rollup pass minifies via `esbuild` (default minifier in
   Vite 6), tree-shakes unused code, and emits a single chunk per
   entry point.

All transformations are deterministic given the same Node + npm
versions.

## Test commands (optional, for reviewer verification)

```sh
npm test           # 217 unit tests under Vitest
npm run typecheck  # tsc --noEmit
```

Unit tests do not require the browser to be running.

## What lives where

- `src/index.ts` — orchestrator (bootstrap, retry loops, per-site nav
  hooks)
- `src/ui/` — panel rendering, settings modal, anchor selection,
  inline SVG icon set used inside the panel UI
- `src/storage/` — settings store, speed store, TM-userscript migration
- `src/discovery/` — selector-cache + heuristic anchor finder
- `src/health/` — diagnostic watchdog + auto-recovery
- `src/sites/` — YouTube + RuTube site bootstraps
- `src/i18n/` — EN/RU translation table
- `tests/unit/` — Vitest specs (run via `npm test`)
- `tests/smoke/` — Playwright + web-ext browser-launching scripts
  (manual verification, not part of the build)

## Privacy

See [PRIVACY.md](../PRIVACY.md) at the repo root. Short version: nothing
leaves the browser. All persisted state (selected speed, hotkeys,
language, slider position, RuTube hide-title / hide-Premium toggles)
lives in `browser.storage.local`. The manifest declares
`data_collection_permissions: { required: ['none'] }` for AMO.

## Permissions justification

- **`storage`** — persists user-selected speed, hotkey bindings,
  language, and per-site preferences locally. Without it, every page
  reload would forget the user's settings.
- **`host_permissions: *://*.youtube.com/*`,
  `*://*.rutube.ru/*`, `*://rutube.ru/*`** — the content script
  must run on YouTube and RuTube watch pages to inject the speed
  panel + slider into the player. We do not enumerate other domains
  and we do not request `<all_urls>`.
