0.7.6 — a bug-fix release. No new permissions, no new hosts, no new endpoints.
The permission set is byte-identical to 0.7.4. Nothing is sent anywhere; the
only storage used is browser.storage.local.

One file changed, src/sites/youtube.ts, in the helper that derives a per-channel
key for the opt-in "remember a speed per channel" feature:

1. The key used to be matched with a regular expression anchored to a leading
   slash, so an absolute author link (https://www.youtube.com/@handle/videos —
   what a user running other YouTube add-ons gets, since they rewrite that
   block) never matched and the feature stayed inert. The href is now resolved
   with the URL constructor and only the first path segment is used.

2. The same channel is linked as /@handle on some pages and /channel/UC… on
   others; the helper now prefers the handle so one channel cannot end up with
   two separate entries.

3. Handles outside the Latin alphabet are decoded rather than skipped.

The key never leaves the browser: it is a map key inside
browser.storage.local, used to restore the playback rate the user last chose
for that channel. Covered by tests/unit/youtube-channel-key.spec.ts.
