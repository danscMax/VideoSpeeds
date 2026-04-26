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

## Dropped scope

- HDRezka is **not** part of this extension (Chrome Web Store policy
  ambiguity + Plyr complexity). It will live in a separate
  "Improve-RuTube" project.
- No service worker, no background script — speed-only flows do not
  need them, and adding them only widens review surface.
