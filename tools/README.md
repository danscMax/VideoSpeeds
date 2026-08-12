# tools/

Diagnostic scripts meant to be pasted into a DevTools console on a live page.
Nothing here ships in the extension package.

## rate-spy.js

Answers "who set `playbackRate` back to 1×" — and, more usefully, "is this
even the same `<video>` element I was listening to". It wraps the prototype
setter to log a stack per write, brands every `<video>` it sees with a
`__spyId`, and dumps a snapshot on `emptied` / `abort` / `stalled` / `error`
including the codec from Stats for nerds.

Paste it whole into the console on a video page, reproduce the problem, send
the entire `[RATE-SPY]` output.

It is what found REL-040: the decoder died with
`NS_ERROR_DOM_MEDIA_METADATA_ERR`, the player silently rebuilt the `<video>`,
and a fresh element starts at `playbackRate = 1`. Nobody had written 1× — the
listeners were on a node that no longer existed. The fix is in
`src/index.ts:528` (a capture-phase `playing` listener on `document`, since
media events do not bubble) with hover previews filtered out in
`src/discovery/validators.ts:63`.
