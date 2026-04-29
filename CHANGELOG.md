# Changelog

All notable changes to **Video Speed Controller (YouTube + RuTube)** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) with [SemVer](https://semver.org/) versioning.

---

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
