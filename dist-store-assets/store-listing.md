# Store listing copy (Chrome Web Store + AMO)

Drop-in copy for the listing forms. EN only -- localize at submission
time if the store requires.

## Short description (max 132 characters)

> Speed buttons, slider, and customizable hotkeys for YouTube and RuTube
> videos. Bilingual (EN/RU). No tracking.

(127 characters.)

## Detailed description (under 16,000 characters)

```
Video Speed Controller adds an always-visible row of speed buttons, a
fine-grained slider, and customizable keyboard shortcuts to videos on
YouTube and RuTube.

WHAT IT DOES

- 9 preset speed buttons on YouTube (1x, 1.25x, 1.5x, 1.75x, 2x, 2.5x,
  3x, 3.5x, 4x) and 7 on RuTube (1x through 3x), positioned right below
  the video.
- Slider for in-between values, with a coloured fill that tracks the
  current speed.
- Single-click on a button = temporary speed for this video only.
  Double-click = save as the default for that site.
- Configurable hotkeys (default Ctrl+C +0.1 / Ctrl+V -0.1) -- assign
  multiple combinations per action so a remote and a keyboard can both
  trigger speed changes.
- In-player gear menu with three tabs:
  - General: slider position (right / below / inside player), language
    switch (English / Russian), behavior toggles, advanced auto-recover
    and self-diagnostics switches.
  - Shortcuts: rebind speed-up / speed-down, add additional combos,
    reset to defaults.
  - Diagnostics: copy a structured report for bug submissions; clear
    cached selectors if a site update breaks the panel.
- Toolbar popup mirrors the in-player menu so you can adjust settings
  without opening a video.
- RuTube-only quality-of-life toggles: hide the overlay player title,
  hide Premium subscription banners.

WHY IT'S RELIABLE

When YouTube or RuTube ships a layout change, the panel recovers
automatically through a five-strategy discovery chain (cached selector
-> exact match -> substring match -> walk up from the video element
-> geometric heuristic). A built-in watchdog detects broken state,
purges bad cache entries, and re-attaches the panel. If the player
SPA-navigates between videos, the panel re-mounts via a MutationObserver
without losing your settings.

PRIVACY

- All settings stored locally in browser.storage.local.
- Zero telemetry, zero analytics, zero remote calls.
- The AMO data_collection_permissions disclosure is set to "none".
- Source available on GitHub for review.

LANGUAGES

English and Russian. UI language is auto-detected from your browser on
first run; switch any time from the gear menu.

LICENSE

GPL-3.0-or-later (GNU General Public License version 3 or later).
```

(Roughly 1,800 characters out of the 16,000 limit -- room to grow.)

## Single-purpose statement (CWS requires this)

> Manage video playback speed on YouTube and RuTube via in-player
> buttons, a slider, and configurable keyboard shortcuts.

## Permissions justification (CWS requires this)

| Permission | Why |
|---|---|
| `storage` | Persist user preferences (speed presets, hotkeys, language, slider position). |
| `host_permissions: *://*.youtube.com/*, *://rutube.ru/*, *://*.rutube.ru/*` | Inject the speed-control UI on the supported video sites. |

(No `tabs`, no `activeTab` for the popup -- the existing host_permissions
already grant URL access for the toolbar popup's active-tab check.)

## Categories

- Chrome Web Store: **Productivity** (or **Tools**)
- AMO: **Tabs** (or **Other**)

## Tags / keywords (where the store accepts them)

video speed, playback speed, youtube speed, rutube speed, hotkeys,
keyboard shortcuts, video player, slider

## Screenshots to upload

Five 1280x800 JPEGs in `dist-store-assets/screenshots/`, designed for
the Chrome Web Store size + format constraints (CWS rejects anything
that isn't exactly 1280x800 / 640x400 and won't accept PNGs with an
alpha channel). Recommended upload order:

1. `01-youtube-panel.jpg` — full mock YouTube watch page with the
   panel docked under the player.
2. `02-youtube-settings.jpg` — same page with the settings modal open;
   shows preset grid + slider position + behaviour toggles in one
   image.
3. `03-rutube-panel.jpg` — full mock RuTube watch page with the panel.
4. `04-rutube-settings.jpg` — RuTube settings modal; demonstrates the
   RuTube-specific "Hide player title" / "Hide Premium banners" rows.
5. `05-welcome-page.jpg` — welcome onboarding (light theme; adds
   visual variety to the otherwise dark deck).

Re-generate any time with: `node tests/store-screenshots/render.mjs`
(needs an extension build under `.output/chrome-mv3/`; run
`npm run build` first).

## Privacy policy URL (CWS + AMO require this)

Host `PRIVACY.md` on GitHub Pages: `https://<author>.github.io/video-speeds/PRIVACY.html`
(or use a Markdown -> HTML conversion via `marked`).
