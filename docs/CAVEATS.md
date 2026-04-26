# Known constraints and caveats

Reference for contributors. The audit (`g-onedrive-2-onedrive-warm-sutton.audit.md`)
captures the underlying rationale; this file is the operational summary.

## Build & dev workflow

### Cyrillic in the project path

The repo lives at `E:\Scripts\Расширения\VideoSpeeds\`. npm/Node/WXT/Vite all
handle this fine, but a few tools choke on the non-ASCII path:

- **Chrome `--load-extension=`** rejects Cyrillic in the path on Windows.
  The Playwright smoke test (`tests/smoke/extension-loads.spec.ts`) sidesteps
  this by copying the build into an ASCII tmpdir before launching Chromium.
  If you ever load the unpacked build manually with `--load-extension=`,
  copy `.output/chrome-mv3` to e.g. `C:\temp\videospeeds-build` first.

- **Local CDP smoke** (`npm run test:smoke:cdp`): the Playwright test
  runner crashes Node with STATUS_STACK_BUFFER_OVERRUN on at least one
  Windows config (CI on Linux is unaffected). For a quick local
  check, the recipe is: build, robocopy to `C:\Temp\videospeeds-build`,
  launch the bundled Playwright Chromium with
  `--load-extension=C:\Temp\videospeeds-build --remote-debugging-port=9333`,
  then run `npm run test:smoke:cdp`. The script attaches to the running
  Chromium via CDP and probes both YouTube and RuTube.

- **PowerShell** for npm/wxt commands needs the explicit UTF-8 prefix
  (`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`) and
  `Set-Location -LiteralPath '...'` with single quotes around the path.

### Build cadence

WXT does not auto-watch outside `wxt dev`. After any source change:
`npx wxt build` (Chrome) or `npm run build:firefox` (Firefox MV3),
then reload the extension in `chrome://extensions/` /
`about:debugging`.

### Bundle budget

CI fails the build if any content-script `.js` exceeds 500 KB. Track
growth with `npx wxt build --analyze` once we start porting CSS / icons
/ logger.

## Cross-browser

### Firefox MAIN-world

Declarative `world: 'MAIN'` in content_scripts is supported in Firefox
128+. Our current `strict_min_version` is `109.0`, so Firefox 109–127
users would silently lose the page-world script (RuTube SPA navigation
hook). Wave 4 web-ext smoke decides whether to bump the min version
or switch to the `injectScript()` fallback.

Fallback path is fully wired: `import { injectScript } from
'wxt/utils/inject-script'` and move `page-world.content.ts` into an
unlisted entrypoint registered under `web_accessible_resources`.

**Wave 4 status (2026-04-26 attempt):** Firefox 150 + web-ext successfully
installed `firefox-mv3` build as a temporary add-on -- this validates the
manifest (incl. `data_collection_permissions`) and bundle structure end-to-end.
Visual UI smoke (does the panel render in Firefox?) was deferred:
- Playwright `firefox.launchPersistentContext` crashed Node with the same
  STATUS_STACK_BUFFER_OVERRUN we hit in `chromium.launchPersistentContext`
  on this Windows config.
- Firefox 150's Remote Agent (port 9444) returns 404 on all standard CDP
  paths (`/json/version`, `/json`, ...), suggesting BiDi-only.
- Manual verification via the visible Firefox window is the recommended
  workaround: `npx web-ext run --source-dir=.output/firefox-mv3
  --target=firefox-desktop --start-url=https://rutube.ru/` and look for
  the panel + check console for `[VIDEO-SPEEDS] page-world script loaded`.
- The Chromium smoke (`npm run test:smoke:cdp`) already proved that
  declarative `world: 'MAIN'` works -- if it broke in Firefox specifically
  we'd see it in the manual smoke or, eventually, an issue report.

### YouTube CSP

YouTube's Trusted Types CSP blocks `world: 'MAIN'` content_scripts. We
restrict the page-world entrypoint to RuTube only. Don't add YouTube
back to its `matches` array — the script will fail to inject and the
isolated content script does not need it (yt-navigate-finish is a
CustomEvent that crosses the world boundary).

## Storage

### Async backend, sync hot paths

`browser.storage.local` is async. Speed control, hotkeys, and
ratechange handlers must read state synchronously or they race the
RatechangeMeter. The pattern (audit C1, lands Wave 1.4): hydrated
`SettingsStore` / `SpeedStore` with `await init()` once during
bootstrap, then sync getters everywhere else. Writes are
fire-and-forget via `update(...)` returning a Promise that callers
do not await on hot paths.

### Tampermonkey GM-storage migration

GM-storage cannot be read from a web extension. See `MIGRATION.md`
for the user-facing consequences and workarounds.

## Coexistence

If the legacy `YouTube & HDRezka Speeds.user.js` is installed alongside
the extension, the extension's `bootstrap()` aborts before injecting
UI. See `src/utils/tm-coexist.ts` and the matching userscript change
that ships in Wave 1.10.

## Cleanup discipline

Every long-lived listener / interval / observer / DOM patch goes
through `ctx.cleanup` (the `CleanupRegistry`). On WXT `onInvalidated`
we call `ctx.cleanup.dispose()` and let the registry tear everything
down. Bare `addEventListener` / `setInterval` / `MutationObserver`
calls are a bug — they leak across HMR reloads and silently double-bind
keydown handlers.

## i18n

`t()` returns plain text only. Markup is built from trusted templates
outside the i18n layer. When user-facing strings are interpolated into
backtick `${}` templates, always wrap them with `escHtml()`. Do not
let translations carry `<` / `>` / `&` glyphs that need escaping.

## Trusted Types

The `safe-html` policy is for *local* extension UI sinks (settings
modal templates, notification HTML). Don't try to use it as a
workaround for YouTube's CSP — keep YouTube isolated-only.

## Logging

Vendor `Userscript Logger Pro` is bundled (Wave 1.5). Production
builds gate at WARN+ via the `__VS_LOG_LEVEL__` Vite define so we
don't spam the console for end users. Bug reports rely on the
diagnostics-tab "copy" button (Wave 1.8b), not remote telemetry —
there is none.

## Release

Tagged releases (`v*`) trigger `.github/workflows/release.yml`:

1. typecheck + unit tests + tag/version match guard
2. build chrome+firefox+userscript
3. stage assets with version-stamped filenames
4. SHA-256 checksums file
5. GitHub Release created with all three artifacts attached

Local-only release prep:

```bash
npm version patch          # bumps package.json
git push --follow-tags     # GitHub Actions takes it from there
```

Optional auto-publish to Chrome Web Store / AMO is commented out in
the workflow -- enable when these secrets exist:

| Store | Secrets |
|---|---|
| Chrome Web Store | `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_EXTENSION_ID` |
| Mozilla AMO | `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` |

`chrome-webstore-upload-cli` (Chrome) and `web-ext sign` (AMO) handle
the uploads. Both providers require an account in good standing first.

## Dropped scope

- HDRezka is **not** part of this extension (Chrome Web Store policy
  ambiguity + Plyr complexity). It will live in a separate
  "Improve-RuTube" project.
- No service worker, no background script — speed-only flows do not
  need them, and adding them only widens review surface.
