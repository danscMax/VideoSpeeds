# Changelog

All notable changes to **Video Speed Controller (YouTube + RuTube)** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) with [SemVer](https://semver.org/) versioning.

---

## [0.3.8] — 2026-05-09

Outcome of a multi-agent audit pass against the entire codebase.
Six grouped commits cover security, data integrity, bootstrap
correctness, async race conditions, UI lifecycle, and high-impact
performance. Plus 31 new regression tests gated on the audit findings.

### Visual

- **Pinned-speed indicator redesign.** The 5×5 dot in the corner of the
  saved/default speed button is replaced by a SVG bookmark icon plus a
  soft accent halo glow around the button. The halo is the primary
  peripheral-vision signal; the icon adds semantic clarity ("saved").
  Colour follows the per-site accent automatically (red on YouTube,
  blue on RuTube).
- **Slider tooltip hidden at rest.** The "1.50x" floating tooltip
  above the slider thumb now appears only on container `:hover` or
  while the thumb is `:active` (drag). At rest it used to overlap the
  video frame above the panel.

### Security

- **Hostname detection anchored to whole-host TLD** (sec C1). The
  previous `host.includes('youtube.com')` matched attacker-controlled
  `youtube.com.evil.tld`, `evil-youtube.com.example.org`. The popup
  calls `detectSite()` over arbitrary tab URLs, so this was reachable.
- **RuTube postMessage bridge tightened** (sec C2/C3). Receiver now
  rejects messages whose `event.origin` is not `window.location.origin`
  (blocks cross-origin iframes / ad embeds), and requires
  `sessionId === 'page'` for navigation events instead of accepting
  arbitrary values (previously a reattach-spam DoS primitive). Session
  IDs use `crypto.getRandomValues` as a strong fallback when
  `crypto.randomUUID()` is unavailable.
- **Popup message sender validation** (sec C4). `runtime.onMessage`
  handler now rejects messages from foreign extensions
  (`sender.id !== runtime.id`) and in-page content scripts
  (`sender.tab !== undefined`).
- **Settings JSON-import allow-listed** (sec C5). Imports go through a
  strict `KNOWN_SETTINGS_KEYS` filter that drops everything else,
  including explicit `__proto__` / `constructor` / `prototype` strip
  and rejection when zero recognised keys remain.
- **Feature-detect probe wrapped in try/catch** (sec C19). Some engines
  expose `'navigation' in window` while `window.navigation === undefined`;
  the chained `.addEventListener` access used to throw TypeError and
  poison the entire bootstrap.

### Data integrity

- **SettingsStore: write queue + rollback on persist failure** (sec C9).
  Concurrent updates serialize through a write-chain; if `adapter.set()`
  rejects (quota, IO, runtime gone) and the live state still equals
  the value we tried to persist, in-memory state rolls back to the
  pre-update snapshot. Subscriber iteration also snapshots the
  subscriber Set so callbacks unsubscribing during notify don't perturb
  the loop.
- **GM-storage envelope JSON round-trip** (sec C10). Userscript-build
  adapter now wraps every value in `{"_v":1,"d":<value>}` so
  primitives and strings round-trip losslessly. The previous
  asymmetric encoding silently coerced stored strings `"true"` /
  `"123"` / `"null"` to `true`/`123`/`null` on read.
- **Discovery validators return a fresh ok-result** (sec C11). The
  previous `const ok = { ok: true, reasons: [] }` singleton was
  returned to all callers; mutating `result.reasons` corrupted the
  global success constant for every subsequent validation.
- **Discovery cache: signature drift comment** (sec C12) and explicit
  `Array.isArray` rejection in TM migration boundary.

### Bootstrap correctness

- **TDZ guard on `killSwitch`** (sec C6). The discovery engine's
  `isFullChainEnabled` closure used to capture a `killSwitch` not yet
  declared. Hoisted into a forward-declared `let` with a `?? true`
  fallback for the brief window before the actual handle is wired.
- **`isDisposed` guard on the popup-message listener install** (sec C7)
  and the SPA-navigation `reattach()` path (sec C8). A late-arriving
  navigation event after content-script teardown used to create a
  fresh `attachCleanup` registry that nobody owned.
- **YouTube-only conditional `panel.removeChild` on reattach.** The
  previous unconditional detach raced YouTube's stable DOM and the
  displacement observer immediately re-inserted the panel. Detach
  only on RuTube where the column swap is real.
- **Language change triggers panel rerender.** On-screen strings used
  to stay stale until the next SPA navigation.

### Async race conditions

- **Click-counter race in speed controller** (sec C13). The router used
  to reset `count = 0` synchronously before kicking off async
  `setGlobal`/`setTemporary`; a click arriving during the in-flight
  storage write was treated as a fresh single-click, silently
  downgrading the just-applied global to a temporary. New `pending`
  flag short-circuits re-entry until the promotion settles.
- **Unhandled rejection on click promotion** (sec C14). Storage
  failures (quota, runtime gone) used to be silently swallowed by
  `void setGlobal(...)`. Now logged via `ctx.logger.error`.
- **Hotkey capture race** (sec C15). Concurrent keypresses during the
  in-flight settings write used to clobber each other. Synchronous
  capture + `dataset.vsBusy` re-entry guard.
- **HealthChecker.runOnce is now read-only.** Previously mutated
  `lastHealthy`, killing the next transition detection inside `run()`.
- **Auto-trip latch resets on sustained recovery.** Previously a
  one-shot for the entire page lifetime.

### UI lifecycle

- **Panel.dispose() removes orphan `#speed-notifications` /
  `#speed-popup`** (sec C16). They live OUTSIDE the panel root
  (anchored on player container / fullscreen element) and used to be
  reused as detached nodes on the next ensureStack/ensurePopup.
- **Notification stack restores host container's inline `position`**
  (sec C17). The toast-stack mutation from `static` to `relative`
  used to leak across reload cycles.
- **Speed-popup `hideTimer` is scoped per-popup via WeakMap** (sec C18)
  instead of a module singleton.
- **Toast timers tracked + cleared on dispose** (eliminates ~3.25s of
  zombie ticks after teardown).
- **Slider `Number.isFinite` guards** the `parseFloat || min` path
  silently coerced a legitimate `0` to the fallback.
- **Escape closes the gear settings menu** (a11y / dialog convention).

### Performance

- **New coalescing storage adapter** (perf O1). Writes are buffered
  per-key for 200ms before reaching the underlying adapter. Wired
  around the speed-store only — held-hotkey at ~30/sec used to blow
  Chrome's 120-writes-per-minute quota in under 30 seconds.
- **`speed_button_count` query scoped to panel root** (perf O11). The
  previous `document.querySelectorAll('.speed-button')` walked the
  entire YouTube DOM on every health tick + every settings-modal
  rerender.
- **`cleanup.setTimeout` self-removes from tracking Set** (perf O17).
  Long-lived registries no longer accumulate dead ids.
- **Logger uses a circular buffer** (perf O20). `Array.shift` on
  overflow at maxHistory=200 was constant pressure on long-running
  tabs.
- **`lcaDistance` is O(d) via `Map<Element,depth>`** instead of O(d²)
  `ancA.indexOf` (perf O7). Significant on YouTube where DOM depth
  runs 15-20 levels and the validator runs on every non-cached resolve.
- **`detectFeatures()` is memoized.** Capability flags are invariant
  within a content-script lifetime.

### Tests

- 16 new regression tests in `tests/unit/audit-2026-05-09.spec.ts`
  covering the security/integrity findings.

## [0.3.5] — 2026-05-08

Closes the three remaining items from the v0.3.4 audit pass plus a
maintainer-flagged design issue: the hardcoded version label in the
settings header forced a screenshot rebuild on every release.

### Added
- **Pinned-speed indicator on preset buttons.** When `rememberSpeed`
  is on, the button matching the saved/default speed gains a tiny
  accent dot in the top-right corner. Active state ("currently
  playing") and pinned state ("default for new videos") are now
  visually distinct.
- **Speed-preset chips grouped by range** in Settings → "Кнопки
  скорости". Three subheaders ("Медленнее 1×", "1× – 2×",
  "Быстрее 2×"). The flat 14-18 pill wall is now scannable.
- **Panel auto-reparents into `fullscreenElement`** when entering
  fullscreen with `sliderPosition='right'` or `'bottom'`. The panel
  no longer disappears in fullscreen on YouTube / RuTube.

### Changed
- **Default hotkeys reset to `Alt+Period` / `Alt+Comma`** (a.k.a.
  `Alt+.` / `Alt+,`). The old `Alt+Shift+ArrowUp/Down` collided with
  the Windows Ru/En layout switcher and was a 3-key chord. **Existing
  users keep their hotkeys** — the change applies only to fresh
  installs and Diagnostics → Full Reset.
- **Version label removed from the settings header.** Earlier it
  forced re-rendering store-listing screenshots on every release.
  Version stays in the diagnostic report.

## [0.3.4] — 2026-05-07

### Accessibility & Usability (UI/UX audit pass)

Same five-expert audit pass as the HDRezka sibling. 13 findings closed
in this release; three (fullscreen reparent, pinned-speed indicator,
preset-pool grouping) ship in 0.3.5.

### Added
- **YouTube default preset row now includes 1×** so a user who
  fast-forwarded can return to normal speed in a single click. Earlier
  set was `[1.5..3.5]` inheriting userscript fast-forward bias —
  audit found the missing 1× consistently confused casual users.
  (`src/config.ts`, `src/ui/buttons.ts`)
- **Brand marker** (`vs-brand`) — a tiny accent-coloured chevron at
  the leading edge of the panel so users can tell at a glance that
  this is our extension rather than native host UI. Host-theme
  mirroring stays intact; this is only an identity cue. (`src/ui/panel.ts`)
- **Hotkey hint in onboarding** — the welcome page's first annotation
  now mentions `Alt+Shift+↑/↓` alongside click + double-click.

### Changed
- **Slider value is now visible at rest** (`opacity: 0.92` instead of
  `0`). Earlier the floating tooltip only appeared on hover / drag.
- **Active settings tab** reads with bold + underline + colour for
  stronger non-colour cue.
- **`vs-help-text` opacity** lifted from 0.7 to 0.85 with better
  line-height, so the "Pick which speeds appear on the in-player
  panel" subtitle is actually readable.
- **Pill-button row** gets a subtle backdrop so it reads as a
  coherent group on host backgrounds.
- **Contrast tokens bumped** for both themes; section captions get
  bold-600 for readability at 10px.

### Fixed
- **Diagnostics gear icon now has `aria-label` and `aria-haspopup`**.
- **"Закрепить навсегда" wording softened** to "сделать скоростью по
  умолчанию для новых видео" in onboarding.

## [0.3.3] — 2026-05-07

### Fixed
- **`Diagnostics → Очистить кеш` no longer reports success when the
  cache wipe fails.** Popup handler now awaits the real adapter call
  before resolving. (`src/index.ts`)
- **First-install settings are now pinned to disk.** Defends against
  silent default-value drift in future versions. One storage write
  per fresh install, ever. (`src/storage/settings-store.ts`)
- **`unhandledrejection` listener now ties to `ctx.signal`.** Without
  it, dev HMR rebuilds accumulated one filter per reload. (`src/entrypoints/content.ts`)
- **`clamp()` rounding comment now matches the code.** Comment claimed
  1-decimal rounding while the implementation rounded to 0.01 — the
  0.01 behaviour is correct (configurable speed step), only the
  comment was misleading. (`src/speed/controller.ts`)
- **RuTube rapid-nav no longer stacks duplicate panel-removal
  observers.** Two next-up clicks within 800 ms used to install
  overlapping observers on the same parent; every child mutation
  fired the callback twice for the rest of the page lifetime.
  Idempotency brand on the parent skips re-installation. (`src/index.ts`)

## [0.3.2] — 2026-05-07

### Fixed
- **YouTube fresh-install no longer plays the first video at 2.75×.**
  `SPEED_BOUNDS.youtube.defaultSpeed` was 2.75 — almost certainly a
  leftover test value, never deliberate. Lowered to 1.0, matching the
  site's own default. Also affects "Diagnostics → Full Reset" on
  YouTube. RuTube's 1.5× default is unchanged. (`src/config.ts`)
- **HealthChecker watchdog now actually watches.** Earlier behaviour
  ran exactly one check 5 s after bootstrap; if the page was healthy
  at that moment, polling never started and any later degradation
  (HLS revert storm, RuTube React swapping the player column, YouTube
  theatre-mode layout flip) went undetected. The gear's red warning
  dot now lights up whenever the page actually breaks. (`src/health/checker.ts`)
- **Ratechange-revert timer escaped the per-attach cleanup registry.**
  The 50 ms counter-revert used a raw `setTimeout`; on SPA navigation
  the disposed timer could still fire and write the previous video's
  rate onto the freshly-attached one. Now routed through
  `cleanup.setTimeout` so it dies with its attach. (`src/index.ts`)
- **Language toggle round-trip silently failed.** Switching `EN → RU
  → EN` left the UI stuck in Russian because the subscriber compared
  against the bootstrap-time language, never updating. Each fired
  comparison now updates the tracking variable. (`src/index.ts`)

## [0.3.1] — 2026-05-07

### Added
- **`role="status"` + `aria-live="polite"` on the speed value**, so
  screen readers announce the new playback rate when it changes via
  hotkey or a preset button click. The native `<input type=range>`
  only announces while focused; the live region covers the
  not-focused paths.

## [0.3.0] — 2026-05-07

### Added
- **`prefers-reduced-motion` support** in the in-player UI. When the
  OS Reduce Motion preference is on, fades/slides/pulses are
  instant; everything else stays.
- **Confirmation dialog on Diagnostics → "Очистить кеш"** matches
  the full-reset gate.
- **`aria-live="polite"`** on the diagnostic status block for
  screen-reader announcements.

### Changed
- Worker (separate deploy): IP addresses are hashed (HMAC-SHA256)
  before storage in KV and are no longer included in the Telegram
  message.

## [0.2.9] — 2026-05-07

### Fixed
- AMO rejected 0.2.8 with
  `"data_collection_permissions/required/0" must be equal to one of
  the allowed values`. The string `'technicalAndInteractionData'`
  isn't in the schema. Corrected to
  `required: ['none']` + `optional: ['personalCommunications',
  'technicalAndInteraction']` — fully opt-in feedback flow expressed
  through the schema's actual key names. PRIVACY.md updated to match.

## [0.2.8] — 2026-05-06

### Changed
- **Default hotkeys** moved off `Ctrl+C` / `Ctrl+V` (collided with the
  system copy/paste shortcut whenever the user had a text selection
  on the page) to `Alt+Shift+ArrowUp` / `Alt+Shift+ArrowDown`.
  Existing installations keep their saved hotkeys; new installs get
  the safer default.
- **Feedback form** "Attach diagnostic report" checkbox now unchecked
  by default — opt-in only.
- **Feedback payload** stopped sending the full `userAgent` string;
  browser-version detection lives inside the opt-in diagnostic blob.

### Privacy
- AMO `data_collection_permissions` updated from `'none'` to
  `'technicalAndInteractionData'` to honestly disclose the optional
  Send-feedback flow.

## [0.2.7] — 2026-05-06

### Fixed
- Popup flicker on Diagnostics open (storage listener was caught by
  every cache-write the HealthChecker emitted).

### Changed
- Settings menu width 340 → 380, popup 380 → 420 so the four-tab
  strip fits.

## [0.2.6] — 2026-05-06

### Changed
- Popup auto-runs `vs:recheck` on Diagnostics tab open so popup and
  gear menu always agree on the report.

## [0.2.5] — 2026-05-06

### Fixed
- Tab strip overflowed both popup and gear-menu frames after the
  underline fix. Now `flex: 1 1 0` distributes width evenly.

## [0.2.4] — 2026-05-06

### Added
- Live diagnostics in toolbar popup via runtime message-passing to
  the content script's HealthChecker.

### Fixed
- Active-tab underline visibly shorter than the label.

## [0.2.3] — 2026-05-06

### Added
- Feedback button in three places: General CTA, Diagnostics action,
  Support row.
- Free-form contact field (email, `@telegram`, Discord, anything).

### Fixed
- Diagnostics action grid disabled in popup context (services only
  available in content script); explanatory banner added.

## [0.2.2] — 2026-05-06

### Changed
- Feedback button moved from Diagnostics into Support tab.

### Fixed
- Popup width pinned with `min-width: 380px` on `<html>`, `<body>`,
  `.vs-popup-shell` to defend against Firefox sampling body intrinsic
  width on first paint.

## [0.2.1] — 2026-05-06

### Added
- Cloudflare Worker + in-extension feedback page (Send Feedback
  button opens a form that POSTs to a developer-owned Worker
  forwarding to Telegram).

### Fixed
- Feedback button tried `browser.tabs.create` (unavailable in content
  script) and silently fell back to a relative URL the host site
  resolved as a 404. Switched to `runtime.getURL()` + `window.open`.

## [0.2.0] — 2026-04-29

First minor bump after the long 0.1.x line of patches. Marks the transition
from "ported userscript" to "store-ready extension" with a fully reworked
welcome page, a configurable hotkey editor, and end-to-end light-theme
support.

### Added
- **Welcome page** — opens once on first install via
  `chrome.runtime.onInstalled`. HTML/CSS replicas of the actual in-player
  panel and settings menu, decorated with SVG dashed connectors that point
  from each annotation to its target. Hover/focus pairs annotations with
  the matching UI part for two-way teaching. Includes a live hotkey
  editor (capture inputs + speed-step picker) that writes settings to
  both YouTube and RuTube storage at once. Two-language switcher (EN/RU)
  pinned top-right.
- **`speedStep` setting** (`Settings.speedStep`) — configurable step the
  hotkeys add or subtract per press, range 0.01–1.0, default 0.1.
  Replaces the hard-coded `SPEED_STEP` constant in the hotkey handler.
- **Light theme support** across all extension surfaces:
  - Settings menu (in-player) — adapts to YouTube light/dark.
  - Toolbar popup — follows the user's OS `prefers-color-scheme`.
  - Welcome page — follows OS preference, live-updates on flip.
- **Hotkey editor in welcome** — capture combos, set step value,
  persists via `chrome.storage.local` for both supported sites.
- **WCAG 2.2 AA hardening** — `:focus-visible` rings on all CTAs,
  YouTube-red shifted to `#cc0000` under white text (5.89:1 vs 3.99:1),
  `aria-hidden` on decorative SVG glyphs, accent-border alpha bumped to
  ≥ 0.55 for non-text contrast.

### Changed
- **Welcome copy rewrite** — 23 strings reworded for clarity in both
  Russian and English (hero headline, value prop, annotations, donate
  body, hotkey labels). Plain-text contract preserved (no HTML markup
  in i18n values; `**word**` markdown for emphasis is parsed at render
  time).
- **`html lang` attribute** synchronised with the rendered locale on
  welcome page so screen readers don't pronounce Russian content with
  English phonemes.
- **Settings-menu palette** — replaced ~80 hard-coded `rgba(255,255,255,…)`
  values with scoped `--vs-menu-*` design tokens that resolve from the
  active `data-vs-theme`. Foundational change that enables light theme
  without touching individual selectors.
- **Replica layout (welcome, Block A)** — annotations swapped: gear is
  on the right (matches the panel's rightmost element), slider sits
  below the panel. SVG connectors no longer cross each other.
- **Preset grid in settings replica** — reduced from 13 pills to 7 to
  remove visual crowding. Settings replica width 380 → 420 px so the
  «Поддержать» tab no longer clips against the right border.

### Fixed
- **Connector overlap** in welcome Block A — slider/gear paths used to
  cross through the same area on the right of the panel; SVG overlay
  now computes per-annotation orthogonal paths.
- **Step-prefix framing** — removed «ШАГ 1 / ШАГ 2» overlines that
  read as a forced linear guide.
- **Popup theme** now follows the host page (YouTube's in-page light/
  dark toggle, RuTube's always-dark) instead of the OS-level
  `prefers-color-scheme` guess. Implementation: content script writes
  `Settings.lastSeenTheme` on each detect/change; popup reads it on
  init and overrides the `detectAndApplyTheme` fallback.
- **Popup per-site accent** — was picking up the YouTube tab even when
  the user clicked the toolbar icon over a RuTube tab. `detectActiveTabSite`
  now uses a query ladder `{active:true, currentWindow:true}` →
  `{active:true, lastFocusedWindow:true}` → `{}` so it returns the
  actually-active tab instead of the first matching one in the
  enumeration.
- **Per-site colour cascade** — settings menu and toggle switches were
  hard-coded `#cc0000` regardless of site. Now they reference
  `var(--vs-accent-dark)` / `var(--vs-accent-darker)` which resolve via
  `[data-vs-site]` set on either `.vs-panel` (in-player) or `<html>`
  (popup). YouTube → red, RuTube → blue, falls back to YouTube-red
  default at `:root`.
- **Welcome copy refinements** — 23 strings reworded for natural
  Russian / English; «вы» → «Вы» as polite form in the hero title;
  "Click on a speed" / "Double-click" split into separate lines for
  readability.

### License
- **Relicensed from MIT to GPL-3.0-or-later** before the first public
  release. Copyleft chosen so any redistributed fork must publish source
  under the same terms. SPDX identifier `GPL-3.0-or-later` reflected in
  `package.json`, `vite.userscript.config.ts` (userscript banner),
  `README.md`, `PRIVACY.md`, and the store-listing copy. Full license
  text in `LICENSE` (verbatim FSF GPL-3.0).

---

## [0.1.x] line — userscript port + store-prep iterations

Each entry below is a single-version release (chronological, oldest at
the bottom). Patch-level so consolidated.

### [0.1.44]
- Welcome page — light-theme groundwork via `data-vs-theme` tokens (final
  pass shipped in 0.2.0).

### [0.1.43]
- A11y batch: `:focus-visible` rings, contrast bumps for YouTube-red
  under white text, keyboard-accessible hover-link via focus/blur,
  `cursor: help` → `cursor: pointer` on annotations.
- Connectors via SVG overlay with auto-recompute on resize.

### [0.1.42]
- Welcome page redesigned: HTML/CSS replicas of panel and settings menu,
  inline annotations, hover-link pairing.
- Live hotkey editor with `speedStep` setting introduced.
- Tips footer (re-open, pin) replaces single pin-tip.

### [0.1.41]
- Onboarding: welcome page on install, header help link, button tooltips.

### [0.1.40]
- Inline custom-speed input in settings; max speed extended to 10x.

### [0.1.39]
- Customizable speed presets, popup width pinned for stability.

### [0.1.38]
- Popup sync skeleton + `min-height: 100vh` (WXT canonical pattern) so
  Chrome's toolbar window opens at correct size.

### [0.1.37]
- Donate tab redesigned with iOS-style two-line rows.

### [0.1.36]
- Donate section: CloudTips, TON, USDT TRC20 wallet support.

### [0.1.35]
- Programmatic DOM construction throughout the UI layer (zero
  `innerHTML` in shipped code, audit follow-up).

### [0.1.34]
- `safe-html.ts` rewritten to drop `innerHTML` in favour of
  `Range.createContextualFragment`, then later eliminated entirely.

### [0.1.33]
- Store-submission prep: icons, author, LICENSE, AMO source-submission
  document.

### [0.1.32]
- Smoke test for narrow-viewport playlist anchor on YouTube; tentative
  anchor retry so the panel migrates above `#below`.

### [0.1.31]
- RuTube path filter; YouTube anchor-before-`#below` to keep the panel
  visible on narrow playlist views.

### [0.1.30]
- Hotkey matcher refuses to match the empty-key placeholder slot
  (prevents speed drift from media-pause keys).

### [0.1.29]
- RuTube SPA navigation: clean-slate detach + 800 ms settle delay.

### [0.1.28]
- Performance: O(1) displacement check in panel-removal observer.

### [0.1.27]
- Speed core: mirror userscript pattern for YouTube `ratechange`.

### [0.1.26]
- Grace window for YouTube ratechange-accept (avoids speed pingponging).

### [0.1.25]
- Silence `Extension context invalidated` log noise from content
  scripts on dev reload.

### [0.1.24]
- Storage adapter swallows `Extension context invalidated` errors so
  fire-and-forget writes don't surface unhandled rejections.

### [0.1.23]
- Responsive overhaul: menu height, modal flip, panel viewport clamp.

### [0.1.22] and earlier
- Internal Wave A–E fixes ported from the original userscript:
  ratechange handling, settings handlers, slider position, lifecycle
  cleanup, storage hardening, theme watcher, panel insertion strategy,
  anti-rerender guard, modal SVG resets.

### Initial 0.1.0 line
- Ported the original `YouTube & HDRezka Speeds.user.js` to a WXT-built
  MV3 extension with full feature parity: bilingual UI (EN/RU), per-site
  defaults, hotkeys, slider, panel, settings modal, diagnostics.
- AppContext + ports architecture (Speed, Settings, Discovery,
  Diagnostics, UI, Cleanup).
- 5-strategy selector recovery; KillSwitch self-diagnostics watchdog.
- TM-import migration so existing userscript users keep their settings.
- 218-test unit suite + Playwright/CDP smoke harness.

---

## Versioning notes

Up through 0.1.44 every UI/feature iteration was a patch bump because
nothing was published. 0.2.0 is the first version shipped to Chrome Web
Store / addons.mozilla.org and serves as the public baseline.

After 0.2.0:
- **patch** (0.2.x) — bug fixes, copy edits, screenshots refresh.
- **minor** (0.x.0) — new feature surfaces, new languages, new sites.
- **major** (1.0.0) — declared after a stable period in production with
  no critical issues; signals API stability for any future integrations.
