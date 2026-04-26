# Migration from the Tampermonkey userscript

This extension supersedes `YouTube & HDRezka Speeds.user.js`. If you used the
userscript before installing the extension, here's what carries over and what
doesn't.

## What migrates automatically

On first run inside a YouTube or RuTube tab, the content script reads these
page `localStorage` keys and imports them into `browser.storage.local`:

- `youtube-speed-settings` — settings object (hotkeys, slider position,
  language, etc.)
- `rutube-speed-settings` — same shape, RuTube
- `youtube-selected-speed` — last selected speed (a single number)
- `rutube-selected-speed` — same, RuTube

After a successful import the extension sets `__migrated_from_tm: true`
in its own settings store so the migration runs exactly once. A toast
notification (`migration.tm_imported` i18n key) confirms what happened.

## What CANNOT be migrated automatically

**Tampermonkey GM-storage** (data saved via `GM_setValue`) is **not
accessible** to web extensions. The WebExtensions API has no bridge to
userscript-manager storage by design. If your userscript stored settings
only in GM-storage and never mirrored them to page `localStorage`, the
extension will start with defaults.

### Workarounds

1. **Open the userscript with a recent version once** before installing
   the extension. Versions of `YouTube & HDRezka Speeds.user.js` from
   the last several months mirror every save into page `localStorage` —
   one page load is enough to populate the keys above so the automatic
   migration finds them.

2. **Export from the userscript, import into the extension** (lands in
   Wave 1.8b):
   - Userscript settings modal → "Export settings" → save the JSON file
   - Extension popup → Settings → "Import settings" → choose that file

## What is NEVER migrated, and why

- **SelectorCache** (`vs-cache:*` keys). These are heuristic lookups
  for site-specific DOM selectors and are tied to the userscript's
  `SCRIPT_VERSION` plus snapshots of the page's DOM signatures. Bringing
  stale cache entries into a fresh extension install gives worse
  resolution than a cold start, so we deliberately ignore them
  (audit M1).

## Coexistence

If the extension and the userscript are both active on the same page,
the extension's first init step detects the userscript via either the
`data-vs-tm-active="1"` marker on `<html>` (set by the latest
userscript) or legacy DOM artifacts (`.speed-button`,
`#more-speeds-container`). When detected, the extension exits early
and surfaces a one-time notification asking you to disable one of
them. See `src/utils/tm-coexist.ts` for the handshake protocol.

## Privacy boundary

The extension reads page `localStorage` only on first run for the
keys listed above, and only on YouTube/RuTube domains. All settings
afterward live in `browser.storage.local`, which is per-extension and
never transmitted off-device. The Firefox manifest declares
`data_collection_permissions: { required: ['none'] }` to make this
explicit on AMO. There is no telemetry, no remote logging, no
analytics.
