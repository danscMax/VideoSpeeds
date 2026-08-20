0.7.5 — a bug-fix release. No new permissions, no new hosts, no new endpoints.
The permission set is byte-identical to 0.7.4. Nothing is sent anywhere; the
only storage used is browser.storage.local.

What changed, all of it in the extension's own content-script logic:

1. src/index.ts — the opt-in "remember a speed per YouTube channel" feature
   needs to know which channel the open video belongs to. It read that from the
   watch-page metadata and gave up after four attempts (0/800/1600/2400 ms).
   When YouTube rendered the metadata later than that, the feature went silent
   for the rest of the page. The lookup now retries for up to 30 seconds and a
   new navigation cancels the previous chain.

2. src/storage/speed-store.ts, src/speed/controller.ts, src/app/ports.ts — a
   speed chosen before that lookup succeeded used to be discarded. It is now
   held in memory and written once the channel is known; a navigation drops it
   so a choice from the previous page cannot be attributed to the next channel.

Both are local behaviour of an opt-in convenience feature that is off by
default. No change to the network surface, the host list or the data the
extension touches.
