# Privacy Policy -- Video Speed Controller

Last updated: 2026-04-26

## What we collect

Nothing.

## What we transmit

Nothing.

## Where settings live

All extension settings (selected speed, hotkey bindings, slider
position, language, "remember speed" toggle, RuTube hide-title and
hide-Premium switches) are persisted in
[`browser.storage.local`][storage], the per-extension local storage
provided by the browser. Data never leaves your device.

[storage]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/local

## Migration from the legacy userscript

On first run inside a YouTube or RuTube tab, the extension reads two
keys from page `localStorage` (`youtube-speed-settings` /
`rutube-speed-settings` and the matching `<site>-selected-speed`) so
existing users of the `YouTube & HDRezka Speeds.user.js` userscript
keep their preferences after switching. Reads are local; nothing is
sent anywhere.

## Diagnostics report

The Diagnostics tab in the gear menu has a "Copy report" button that
puts a JSON snapshot on your clipboard. The snapshot includes the
domain (e.g. `youtube.com`), the page path **without query string or
URL fragment**, your user agent, viewport size, the panel's own state,
and recent ratechange events. The report is generated only when YOU
click the button and is placed only on YOUR clipboard -- the extension
itself never sends it anywhere. Paste it into a GitHub issue if you
want to send it to the developer.

## Permissions explained

| Permission | Why |
|---|---|
| `storage` | Persist your settings between sessions. |
| `host_permissions: *://*.youtube.com/*, *://rutube.ru/*, *://*.rutube.ru/*` | Inject the speed-control UI into supported video pages. The extension does not run on any other site. |

The Firefox manifest declares
`browser_specific_settings.gecko.data_collection_permissions: { required: ['none'] }`
so the AMO listing makes the zero-collection promise machine-readable.

## Source code

The extension is open source under the MIT licence. Audit the
implementation at the project's GitHub repository.

## Contact

File issues or questions on the GitHub repository.
