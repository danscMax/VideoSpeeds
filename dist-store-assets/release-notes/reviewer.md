0.7.9 — a bug-fix release. No new permissions, no new hosts, no new endpoints.
The permission set is byte-identical to 0.7.4. Nothing is sent anywhere; the
only storage used is browser.storage.local.

What changed:

1. src/index.ts — the opt-in "remember a speed per channel" feature derives a
   key from the author link on the watch page. On an SPA navigation YouTube
   updates the URL before repainting that block, so the key read right after
   the navigation belongs to the PREVIOUS video. The old code stopped at the
   first key it found and kept it for the page, which meant one channel's
   remembered speed was served on unrelated channels. The key is now cleared
   when navigation starts and re-read for the duration of the existing retry
   window, adopting the current value; an epoch counter cancels the previous
   page's chain. The owner block is additionally only trusted when the
   `video-id` attribute on `ytd-watch-metadata` matches the `?v=` parameter,
   so a read taken while the page is mid-navigation returns "unknown" rather
   than the previous video's channel.

2. src/health/report.ts, src/health/types.ts, src/ui/settings/{modal,diag-status}.ts,
   src/i18n/dict.ts — the Diagnostics tab now displays the recognised channel,
   the speed stored for it, the global default and the speed currently playing.
   All four values already existed in memory; this only renders them, so a user
   can report what the extension believes instead of the author guessing.

No change to the network surface, the host list, or the data the extension
touches. The channel key never leaves the browser: it is a map key inside
browser.storage.local used to restore the playback rate chosen for that channel.
