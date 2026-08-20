# Changelog

All notable changes to **Video Speed Controller (YouTube + RuTube)** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) with [SemVer](https://semver.org/) versioning.

---

## [0.7.9] — 2026-08-20

### Fixed

- **The speed set on one channel spread across all of YouTube.** On an SPA
  navigation YouTube swaps the URL before it repaints the owner block, so the
  channel read a moment later is still the PREVIOUS video's. The lookup stopped
  at the first key it found, latched that stale channel for the whole page, and
  then served its remembered speed on every following video — which reads as
  "the speed I chose for one channel became the speed for everything". The
  owner's diagnostics showed it plainly: `yt:@NavalnyRu` while the page was
  SHAWSTRENGTH. The key is now cleared on navigation and re-read for the whole
  30-second window, adopting whatever the page says now instead of trusting the
  first answer. And the read itself is now honest about freshness: the owner
  block is only believed when the `video-id` on `ytd-watch-metadata` matches
  the `?v=` in the address bar. Without that check the very first read — which
  happens synchronously inside the navigation handler, exactly when the DOM is
  known-stale — still answered with the previous channel, so the wrong speed
  was applied for the first second and a fast click could be written into the
  previous channel's entry. Unknown beats confidently wrong.

### Added

- **Diagnostics now says what the per-channel memory knows about this page** —
  the identified channel, the speed stored for it, the global default and what
  is actually playing. Until now that state lived only in storage, so a user
  reporting "it does not remember" and the author reading the code had no
  common ground; the answer needed a console session on the user's machine.

---

## [0.7.6] — 2026-08-20

### Fixed

- **The channel was not recognised when its link was absolute.** The key was
  parsed with a pattern anchored to a leading slash, so
  `https://www.youtube.com/@handle/videos` — the shape a viewer running other
  YouTube add-ons gets, since they rewrite the owner block — never matched. No
  key means per-channel memory does nothing at all: nothing is read, nothing is
  written. Reported and measured on the owner's own browser. The link is now
  resolved as a URL, so relative and absolute forms give the same key.
- **One channel could end up with two keys.** YouTube links the same channel as
  `/@handle` on one page and `/channel/UC…` on another, and whichever came
  first in the DOM won — so a speed saved under one form was invisible under
  the other. The handle now always wins, with the id as the fallback.
- **Non-ASCII handles** (`/@Дайте_Пушку`) are recognised; the old `\w`-based
  pattern silently skipped them.

---

## [0.7.5] — 2026-08-20

### Fixed

- **Per-channel speed memory did nothing on a slow YouTube.** The channel key
  was looked up four times only — 0/800/1600/2400 ms after a navigation. Past
  that the feature went silent for the whole page: the remembered speed was
  never read, and every later click was dropped without a trace, because the
  write bailed out when no key was set. Measured on the live site 2026-08-20:
  after an SPA navigation the metadata regularly renders past that window, so
  for a viewer on a throttled YouTube the toggle looked broken. The lookup now
  keeps retrying for 30 s (a new navigation cancels the previous chain), and a
  speed chosen before the key resolves is parked and written as soon as it
  does — a navigation drops the parked value so it cannot land in the next
  channel.

---

## [0.7.4] — 2026-08-15

Version 0.7.3 was skipped so both twins carry the same number again — HDRezka
needed a 0.7.3 of its own for a Chrome rejection that never applied here.

### Fixed

- Firefox for Android stopped offering updates after 0.6.1. AMO marks a version
  desktop-only unless the manifest declares `browser_specific_settings.
  gecko_android`; the versions that did reach Android (0.5.2–0.6.1) were
  uploaded through the dev hub with the Android box ticked by hand, and every
  release since went up through `scripts/submit-amo.mjs`, which never set it.
  Confirmed against the AMO versions API on 2026-08-15: `compatibility` carries
  no `android` entry from 0.6.2 on. The key is now emitted by `wxt.config.ts`
  for the Firefox target, with the same 142.0 floor as desktop.

### Changed

- Russian store summary: «без рекламы и трекинга» → «без рекламы и слежки».
  Chrome only picks the summary up from a new package, so the wording that has
  been live on AMO since 2026-08-14 reaches the Chrome listing with this build.

---

## [0.7.2] — 2026-08-12

### Changed

- **YouTube leads the title again.** 0.7.1 had put the uncontested sites first
  — RuTube, Dzen, VK — on the reasoning that competing for "video speed
  controller" against a 3M-install incumbent is how a listing stays invisible.
  The owner's call is that recognition wins: a title opening with sites a
  reader has never heard of reads as a different product. The reverse order
  ran for one day and produced no number either way, so nothing was measured
  and nothing is being discarded. The short description follows the same order.

## [0.7.1] — 2026-08-11

### Changed

- **The store listing is now bilingual.** Chrome shows one listing per item and
  takes its title and summary from the package, so a Russian-speaking searcher
  was only ever matched against English text — which is how a product built for
  RuTube, Dzen and VK ended up with 86% of its installs from English speakers.
  The package now carries `_locales`, and the title leads with the sites that
  have no competition instead of echoing a 3M-install incumbent's name.

### Fixed

- **On RuTube the speed panel sometimes never appeared at all.** On a cold
  profile it was missing on two loads out of three: RuTube replaces the whole
  page column while hydrating, and the panel went down with the branch it was
  standing in. The watcher that would have noticed was attached to that very
  branch, so it never fired, and nothing else looks until you navigate. A few
  checks in the seconds after insertion now catch it and put the panel back.
  Six live loads in a row after the fix, against two failures in three before.

### Fixed

- **The "leave a review" ask was hidden from most users.** It only appeared in
  the Firefox build, on the reasoning that AMO was the only store the extension
  was listed in. That stopped being true when the Chrome listing went live, and
  nobody revisited the rule — so the ask was withheld from the larger half of
  the audience while the review count sat at zero. It now appears after positive
  feedback in both builds, and the link goes to the store that build came from.

### Added

- **Shorts now has its own speed, and its own controls.** Someone who keeps
  regular videos at 2x used to land in Shorts already sped up with nothing on
  screen to change it — the panel has no anchor in that layout. Shorts now
  remembers its speed separately (starting at normal), and three compact
  controls sit in the action column beside like and share: faster, the current
  speed, slower. Tapping the readout returns to normal speed.

### Fixed

- **The in-player slider was painted YouTube red on every site.** The site
  accent is declared on the panel, and the "in player" slider position moves the
  slider out of the panel into the player's own control bar — where the rule no
  longer matched and the default red won. The page now carries the site tag, so
  every surface that leaves the panel inherits the right colour.

## [0.7.0] — 2026-08-10

### Changed

- **The speed confirmation no longer moves between modes.** It hung at the
  middle of the right edge in a window and jumped to the top centre in
  fullscreen; both spots had a reason, but a control that relocates reads as a
  bug. It now sits at the top centre of the player in both, where video players
  conventionally put an OSD — clear of the controls along the bottom and out of
  the picture's focal centre. It still grows in fullscreen; that is scale, not a
  different place.

### Added

- **VK Video (vkvideo.ru and the video section of vk.com) is now supported** —
  opt-in, like Dzen. It ships with its unknowns declared rather than filled in:
  VK's player creates no `<video>` under any automated browser, so unlike every
  other site here its DOM was never measured, and the table carries exactly one
  selector — the class name VK's own stylesheet gave up. The rest is resolved by
  the engine's heuristic strategy (largest video by area, tightest containing
  ancestor), which is the mechanism built for unmeasurable and changing DOM.
  Consequence, and it is the intended one: the "in player" slider position is
  NOT offered on VK, because its control bar was never measured. The gate
  derives that from the selector table, so it turns itself on the day someone
  fills the bar in — `node scripts/harvest-site-selectors.mjs --snippet`
  produces the report from a normal browser.
  Host access is scoped to the video section; the extension never runs on the
  rest of vk.com.
- **Dzen video (dzen.ru) is now supported** — speed buttons, slider and hotkeys
  on `dzen.ru/video/watch/…` and Dzen shorts, with the panel anchored between
  the player and the description. Every selector was measured on the live site
  rather than guessed (`scripts/harvest-site-selectors.mjs`, kept in the repo
  for the next site or the next Yandex redesign); Dzen hashes its class names
  per build, so the matching is substring-based by necessity.
  Dzen is an **opt-in** host: it is deliberately not in `host_permissions`,
  because in Chrome a new required host permission disables the extension on
  every existing install until the user re-accepts it. Open a Dzen video, click
  the extension icon, press "Allow" once.
- **The in-player slider position is now offered on RuTube too.** It had been
  gated on a literal `site === 'youtube'` while RuTube's control-bar selectors
  had been in the table all along. The gate now derives from that table, so any
  site with a control bar gets the option automatically.
- `activeTab` permission. Without it the popup cannot read the address of a tab
  it has no host permission for, so on an opt-in site it could not tell which
  site it was on and never showed the "Allow" button — the grant was
  unreachable. activeTab is scoped to the tab you invoked the extension on and
  carries no install-time warning.

### Fixed

- RuTube's in-player control cluster was addressed by a selector that matches
  nothing on the current site: the right-hand column carries no "right" in its
  class attribute at all (measured — zero hits across the player subtree). The
  slider fell back to the whole control wrapper. Now matched on the utility
  class RuTube actually uses, with the old patterns kept as trailing fallbacks.

- The in-player speed slider (Settings → slider position → "in the player")
  no longer disappears in fullscreen. It had been swept into the same hide rule
  as the floating panel, which left that display mode with nothing on screen in
  the one place a video is actually watched. It is a player control, not
  extension furniture: it sits inside YouTube's own control bar and already
  fades in and out with the rest of the controls. The floating panel stays
  hidden in fullscreen, unchanged.
- The live fullscreen smoke was asserting on that slider without ever creating
  it — the default slider position is "right", so the element was simply absent
  and the check passed while proving nothing. It now switches the setting
  through the real settings UI first, and the YouTube and RuTube mock pages grew
  the control clusters they had always lacked.

## [0.6.6] — 2026-08-06

### Fixed

- **The tip shown to a brand-new user was cut off mid-sentence** and its close
  button was pushed off screen. It now wraps onto a second line and reads in
  full.
- **On YouTube the tip often never appeared at all.** It was tied to the panel
  reaching its final position, which on YouTube frequently never happens —
  so the panel was on screen with nothing explaining it. It now appears as
  soon as the panel does.

## [0.6.5] — 2026-08-05

### Fixed

- **In fullscreen the speed confirmation stayed white on a light-themed site.**
  It floats over video, not over the page, so it now keeps its dark plate
  whatever theme the site is in.
- **Messages that wait for a decision could park on the picture** in players
  that fake fullscreen with CSS instead of the browser's own (HDRezka's does).
  They now fade after eight seconds there too, like everywhere else.

## [0.6.4] — 2026-08-05

### Fixed

- **In fullscreen the hotkey now confirms what it did.** The July rule "no
  extension UI over the picture" had swept up the "1.50x" that flashes after a
  speed change — and since the panel is hidden in fullscreen, the hotkey is the
  only control there. You pressed it and nothing on screen said whether
  anything happened. The panel and the in-player slider stay hidden; the speed
  confirmation and short messages are back, and in fullscreen the confirmation
  is bigger and sits at the top centre where you can actually see it.
- Messages that wait for a decision ("Continue from 42:15", "Panel failed →
  Reload") now appear in fullscreen too, but there they fade after eight
  seconds instead of parking on the film until you find their ✕.

## [0.6.3] — 2026-08-05

### Changed

- **A video no longer starts faster than normal on its own.** On RuTube a
  brand-new install used to play the first video at 1.5× with nothing on screen
  explaining it. 1.5× is still one click away on the panel. If you have ever
  picked a speed yourself, nothing changes for you.
- **The extension now explains itself where it is used.** The first time the
  speed panel appears, a small note says what a click and a double-click do and
  where the hotkeys live. It waits for you to close it, and never comes back.
- **The welcome page opens after an update too** — but only when the extension
  has actually lost access to YouTube or RuTube, which is the one case where it
  stops working without saying why.

### Fixed

- **The welcome page promised speeds the extension cannot reach.** It said
  "0.5–10x"; the real floor is 0.75× on YouTube and 1× on RuTube. Anyone who
  installed this to slow a lecture down hit a wall the first screen had
  promised them past.
- The button that takes you to a video site was the last thing on the welcome
  page, after the donation block — it is now right under the title as well.
- The advice to pin the extension to the toolbar was the faintest text on the
  page; it is now a proper callout.
- The example panel on the welcome page invited clicks and did nothing.
- Screen-reader users were told the labels were buttons that do nothing.
- Hovering the toolbar icon said only "Video Speed Controller", dropping the
  "(YouTube + RuTube)" that tells it apart from the HDRezka extension.

### Internal

- Both READMEs and both store listings called the settings tab "Shortcuts"; in
  the product it is "Keys", and neither mentioned the "Support" tab. The English
  listing was missing a sentence the Russian one had. Store screenshots were
  regenerated (they still showed the old default speed and the wrong range), and
  the RuTube settings screenshot now actually shows the RuTube-only toggles its
  own caption promised.

## [0.6.2] — 2026-08-05

### Added

- **The extension now tells you when it has no access to the site.** Firefox
  grants site access when you install an add-on, but it does *not* grant access
  it gains in an update — so the extension can end up doing nothing on YouTube
  or RuTube, with no panel and no error to explain why. The toolbar icon now
  shows a red "!" with an explanation, and clicking it offers to fix it in one
  click. The same offer appears on the welcome page after installing.

- **Liked it? There is now a way to say so.** After you send positive feedback,
  the form offers a link to the add-on's review page. It never interrupts you
  and only appears once the message has actually gone.
- **The popup is no longer a dead end on other sites.** Opening it somewhere
  that isn't YouTube or RuTube used to just say so; it now offers buttons that
  take you there.

### Fixed

- **The access banner in the popup showed raw text like `popup.grant.title`.**
  Its translations were missing entirely from this extension.
- **On Firefox, the button that grants access appeared to do nothing.** The
  browser anchors its own permission window to the toolbar button, which is
  exactly where our panel hangs — so its "Allow" landed behind our own window.
  The panel now steps aside first.
- **The "no access" warning could be wrong.** It asked about YouTube and RuTube
  as one question, so permission to one and not the other still warned. The two
  sites are independent, and the warning now means the extension cannot work on
  either.
- **The speed panel could silently never appear.** If any script on the page had
  left behind an invisible element with a common name like `speed-button`, the
  extension assumed a rival speed control was present and shut itself down, with
  nothing on screen to explain it. Only controls you can actually see count now.

### Changed

- The list of supported hosts now lives in one place instead of three, so the
  manifest, the content script and the permission checks cannot drift apart.

### Internal

- The background worker now refuses messages from other extensions, the
  permission-warning rule is shared with the twin project (and watched for
  drift), and the manifest is covered by tests — it is built from the host list,
  and nothing checked that the two agreed.

## [0.6.1] — 2026-07-28

### Changed

- **No extension UI in fullscreen.** Entering fullscreen used to drag the whole
  panel into the fullscreen element on purpose (v0.3.5 audit MAJ-9), so buttons,
  slider, gear — and the "1.50x" popup — sat on top of the picture. That
  re-parenting is gone: the panel stays at its anchor beside the player (which
  native fullscreen simply does not render), the surfaces that live inside the
  player (in-chrome slider, speed popup) are hidden by `:fullscreen` rules, and
  toasts no longer appear over the video. A durable chip (the resume offer, or a
  "panel failed → reload" warning) isn't lost: it waits and appears once you
  leave fullscreen — unless it went stale meanwhile (watched past the resume
  point), in which case it never shows. Keyboard shortcuts keep working — they
  never depended on the panel. Ported from HDRezkaSpeeds.
  Side effect: the reparent also fought the panel's own removal-watcher, which
  yanked the panel back out on the *first* fullscreen entry and stopped watching
  afterwards; both the flicker and the dead watcher are gone with it.

## [0.6.0] — 2026-07-16

### Added

- **"Show time-saved badge" toggle** (Settings → Behavior) hides the
  "finish N earlier" badge for anyone who finds it noise. The badge now
  carries a clock icon so its meaning reads without hovering for the tooltip.
- **Current speed on the toolbar icon.** The extension icon shows a small
  badge with the active playback rate (e.g. `1.5`) so you can see it at a
  glance without opening the popup; it clears at normal 1× speed.

### Changed

- **Slider default upper bound now follows the fastest speed button** instead
  of the absolute site cap — the slider spans exactly the buttons out of the
  box. Set an explicit range in Settings → Slider range to override.
- **Terminal failures now show a durable chip with a "Reload" button** instead
  of a 3-second toast that vanished before it could be read. When the speed
  panel can't attach, or no video is ever found, the message and its recovery
  action stay put until dismissed.
- **Clearer "playing vs saved" speed buttons.** The saved-default button used a
  large blurry accent halo that competed with the currently-playing button for
  attention (worst on the dark theme). It's now a crisp accent outline plus a
  bookmark, so the solid-filled "playing now" button stays the primary read —
  and the bookmark glyph is unified with the pin button's.

### Security

- **Explicit Content-Security-Policy on the extension's own pages.** The
  popup/welcome/feedback pages now declare `connect-src 'self' <feedback
  worker>` (on top of the MV3-default `script-src 'self'`), so the only
  outbound connection they can make is the feedback submission you trigger —
  everything else is blocked.

## [0.5.3] — 2026-07-10

### Fixed

- **REL-040 listener ignores hover previews.** The re-attach listener now
  runs the `video` validator first, so unbranded hover-preview videos on
  the YouTube home page don't dispose the live attach registry (and stomp
  the temporary speed) on every card hover.

## [0.5.2] — 2026-07-10

### Fixed

- **Speed survives player-crash recovery (REL-040).** When the browser's
  media decoder dies mid-playback (e.g. Firefox software-AV1 failing on a
  4K quality switch after a seek: `NS_ERROR_DOM_MEDIA_METADATA_ERR`),
  YouTube silently rebuilds the `<video>` element and restarts at 1× —
  with no SPA navigation, so all per-element listeners died with the old
  node and the saved speed was never restored until the user clicked a
  speed button again. A document-level capture listener now detects a
  fresh unattached `<video>` starting to play and re-arms the attach
  pipeline, restoring the saved speed automatically.

## [0.5.1] — 2026-06-10

### Fixed

- **Light theme polish** (mirror of HDRezkaSpeeds 0.5.1): button pills
  barely read on white pages (fill 0.06 → 0.08, border 0.10 → 0.16),
  and the pinned-speed halo bled into white backgrounds making the pill
  look washed-out — glow tightened, inset accent ring added.

## [0.5.0] — 2026-06-10

### Added

- **Quick-action hotkeys.** Reset to 1× (default Alt+0), toggle between
  the last two speeds, and seek ±N seconds (N configurable 1–120 s) —
  all rebindable in Settings → Shortcuts, where the hotkey speed step
  (0.01–1.0) is now also editable.
- **Per-channel speed memory** (opt-in, Settings → Behavior): each
  YouTube channel remembers its own speed (LRU-capped at 200 channels;
  RuTube has no channel key and keeps the global behaviour).
- **Ad-aware speed control (YouTube).** Ads play at YouTube's own pace:
  the extension no longer forces the saved speed onto ads, mirrors ad
  rate-flapping into its UI, or counts it toward the rate-storm
  diagnostic; the saved speed is restored on the first content frame.
- **Shorts behaviour defined:** no panel is injected into the Shorts
  layout (there is no sane anchor); hotkeys and the toolbar popup still
  control the Shorts video.
- **Preserve-pitch toggle**, **volume boost** (100–300%, Web Audio, with
  a CORS caveat), **compact panel mode**, **"finish N min earlier"
  badge**, **popup quick actions** (preset buttons in the toolbar popup)
  and **preset profiles** (Movies / Lectures / Minimal) — same set as
  the HDRezkaSpeeds 0.5.0 twin.
- Twin-drift checker (`npm run drift`) comparing the shared core with
  HDRezkaSpeeds.

### Changed

- Settings modal: short centred tab indicator, brighter scrollbar +
  scroll-edge fades, visible keyboard-focus rings, "Press keys…"
  placeholder during hotkey capture, Esc badge, focus trap, inline
  field-error rings, reserved-combo warning, confirm-on-discard for
  partial resets, import preview, diag-tab feedback pre-attaches the
  report, double-click semantics explained inline, Diagnostics tab
  explainer line.
- Toasts: tinted hairline border + higher-contrast background; pinned
  bookmark near-white on dark pills; slider thumb accent halo; floating
  slider tooltip clamped to the container; welcome replica shows the
  pinned state and a breathing slider thumb.

### Fixed

- A speed saved by double-click no longer evaporates when the page is
  reloaded within the 200 ms write-coalescing window (pending writes
  flush on `pagehide`).
- One throwing probe or render no longer kills the health watchdog for
  the rest of the page (subscriber + report probes are isolated).
- Rate-meter no longer counts player lifecycle noise (transitions
  through rate 0, ad start/stop) toward the "rate storm" threshold.
- Storage write failures (quota, dead context) now surface as a one-time
  toast instead of disappearing silently; the same applies to a video
  element that never appears (retry budget exhausted).
- Self-write grace window is robust against timer glitches after
  suspend/resume.

---

## [0.4.3] — 2026-05-11

### Bug fix

- **"Связаться с автором" CTA in the in-player Settings did nothing.**
  Clicking the button under the gear icon (large red CTA at the
  bottom of the General tab) silently failed; the same button in the
  toolbar popup worked. Root cause: the handler did
  `window.open(chrome-extension://feedback.html)` from content-script
  context, where the page's own `window` (origin youtube.com /
  rutube.ru) is treated as the navigation initiator. Since the
  target URL isn't in `web_accessible_resources`, the browser
  silently drops the open. The popup didn't see this because its
  own origin matches the extension's.

  Fix: route the open through the background SW via
  `runtime.sendMessage({ type: 'open-extension-page', path: ... })`.
  Background calls `browser.tabs.create` — SWs are allowed to open
  extension URLs without the `tabs` permission. Background's handler
  has a strict allow-list (`/feedback.html`, `/welcome.html`) so the
  proxy can't be tricked into opening arbitrary internal pages.

## [0.4.2] — 2026-05-11

Wave 6 — remaining Low-priority items from the 2026-05-11 audit.
Closes the audit cycle: every item from `verified-findings.md` is
now either fixed, documented as known limitation, or deferred with
explicit justification.

### Reliability

- **REL-012 — `attachToVideo` retry cap.** Previously looped every
  500 ms forever on pages where the video never appears. Now: max
  20 attempts with exponential backoff (`500 ms × 1.2^attempt`,
  capped at 5 s). The orchestrator re-arms attachToVideo on every
  SPA navigation, so giving up here is bounded — the next nav gets
  a fresh try.

- **REL-013 — fullscreen reparent fallback.** On exit-fullscreen,
  if the original parent was detached during fullscreen (SPA
  navigation while fullscreen), restoring would silently orphan the
  panel — its sibling-watcher's parent is the same detached node so
  it wouldn't re-trigger. Now: `document.contains(panelOrigParent)`
  check; on failure, fall back to `scheduleInsertWithRetry` which
  re-resolves the anchor against the current DOM.

- **REL-014 + PERF-008 — theme observer debounce.** Theme-persist
  observer now debounces by 500 ms with re-check at fire time.
  YouTube's class-shuffle storms (cinema mode, theater toggle,
  sidebar collapse) all coalesce into a single (or zero) actual
  storage write. Plus: `detectAndApplyTheme` now writes
  `dataset.vsTheme` only when the value actually changed —
  eliminating redundant observer fires entirely.

### Performance

- **PERF-005 — slider drag visual fill batched into rAF** (shipped
  in 0.4.1; documentation note).

- **PERF-007 — logger history doesn't pin live refs.** The
  diagnostic-history circular buffer was holding original detail
  refs (`logger.debug('matched', el)` patterns kept detached DOM
  nodes alive for ~2-4 min until the buffer wrapped). Now each
  detail arg is snapshotted to a string at capture time
  (`<tag#id.cls>` for Elements, message+stack for Errors,
  `JSON.stringify` with circular-ref guard for objects).
  Live console still gets original refs (DevTools can inspect),
  only the export buffer holds GC-safe snapshots.

- **PERF-010 — buttons row no-op refresh short-circuit.** Both
  `refreshActiveButton` and `refreshPinnedButton` now cache the
  last-applied value on the row element itself; same-value calls
  return immediately without touching the DOM. The walk that does
  fire iterates direct children (not a full querySelectorAll
  subtree walk). Ratechange events (HLS quality switches,
  self-write echoes, modal-open rerenders) all hit these
  refresh functions repeatedly — most calls are now O(1).

- **PERF-013 — health checker pauses on hidden tabs.** The 30 s
  poll interval used to fire even when the tab was hidden (Chrome
  throttles to 1 Hz so the cost is small, but multiplied across
  hundreds of background tabs it adds up). Now: a
  `visibilitychange` listener pauses the interval when the tab
  hides and resumes when it returns to foreground.

## [0.4.1] — 2026-05-11

Wave 5 — deferred Mediums from the 2026-05-11 tech-debt audit plus a
user-reported pin-button regression.

### Bug fixes

- **Pin button ("Save current as default") restored old global instead of
  saving the current speed.** Reproduction: global = 2.75x. User drags
  slider to 2.5x. User clicks the bookmark pin. Result: video snapped
  back to 2.75x and 2.75x was re-confirmed as the global. Cause: the
  pin handler read `ctx.speedStore.current()` — which is the
  PERSISTED global, not the actually-playing speed. The temporary-
  speed channel (`smart`) and the live `video.playbackRate` were
  ignored. Fix: read order is now `video.playbackRate` →
  `speedStore.smart()` → `speedStore.current()` (most-effective →
  most-conservative).

### Security / Platform

- **PLAT-002 — removed `__VS_PAGE_WORLD` fingerprint global.** The
  page-world bootstrap used to assign `window.__VS_PAGE_WORLD =
  "loaded@<timestamp>"` for idempotency. The timestamp was a passive
  fingerprint surface readable by any in-page script (RuTube ads /
  analytics / widgets). The existing `__vs_historyHookInstalled`
  boolean is sufficient for idempotency without leaking time-of-load.

- **PLAT-003 — versioned bridge envelope.** Bumped the `source`
  literal from `"video-speeds"` to `"video-speeds@1"` in both the
  isolated content script and the page-world script. The page-world
  history-hook is installed permanently on first page load — its
  closure can survive an extension HMR / future protocol bump. The
  versioned envelope lets the isolated side reject envelopes from a
  pre-bump page-world closure rather than silently mis-parsing a new
  schema. Bump together on every breaking envelope change.

- **V-F20 — documented TM-coexist DoS limitation.** The
  `document.documentElement.dataset.vsTmActive` marker we use for
  Tampermonkey coexist coordination is settable by the host page,
  so a hostile site can suppress our injection. This is functional
  denial only (no data exfiltration) and the marker design is
  load-bearing for actual TM coordination. Documented as a known
  limitation in `utils/tm-coexist.ts`; if a real user reports the
  extension dead on a specific site, check for `vsTmActive` first.

### Performance / Reliability

- **REL-009 — discovery cache now enforces TTL.** Cache entries
  carried `valid_until` since the original implementation but the
  field was never read on `get()`. Stale entries lived forever
  unless `bumpFailure` purged them. Now `cache.get()` checks
  `Date.now() > valid_until` and treats expired entries as a miss —
  next resolve falls through to the selector tables / heuristics
  and rebuilds a fresh entry.

- **PERF-005 — slider drag visual fill batched into rAF.**
  `updateSliderFill` was called synchronously on every `input` event
  (~120Hz on high-DPI mice / touchpads) for ~5 DOM mutations each.
  Now bundled inside the existing rAF callback alongside
  `applyTransient`, capping DOM ops at the repaint rate (60Hz) for
  identical perceived smoothness.

- **PERF-009 (VS only) — RuTube `applyHides` skips when unchanged.**
  The subscriber for `hidePlayerTitle` / `hidePremium` toggles fired
  on EVERY `settings.update()` (language switch, hotkey edit, slider
  position, etc.). Now tracks last applied values and skips the
  `getElementById` + style-tag toggle work when nothing changed.

- **PERF-012 — coalescing adapter `remove()` no longer flushes
  unrelated pending writes.** The previous implementation awaited
  `Promise.allSettled(...all pending...)` to flush everything
  alongside the remove, turning unrelated fire-and-forget speedStore
  writes into blocking writes whenever a remove happened to overlap
  them. Now `remove()` simply drops any queued write for its key and
  forwards directly to the inner adapter; other pending writes
  continue on the next flush.

### Documentation

- **PLAT-007 — corrected "120-writes-per-minute" comments.** The
  coalescing adapter's header docstring and the slider-drag comment
  in `panel.ts` cited Chrome's `MAX_WRITE_OPERATIONS_PER_MINUTE = 120`
  quota as the motivation for coalescing. That quota applies to
  `chrome.storage.sync` only — `.local` (what we use) has a size
  cap but no rate limit. Coalescing remains valuable for IPC + disk
  amortization; the docs now say so accurately.

## [0.4.0] — 2026-05-11

Full-cycle tech-debt audit (7 parallel auditors + DA validation + lead
verification) followed by a 4-wave remediation sweep. Verified-findings
report: `plans/tech-debt-video-extensions/2026-05-11/`.

### Critical bug fixes

- **Settings-store rollback corruption on concurrent updates (REL-001).**
  Two overlapping `update()` calls could corrupt each other's rollback
  target — when A's write rejected after B had advanced state, A's
  rollback was a no-op while B's rollback restored A's never-persisted
  pre-state. Memory and disk diverged silently. Fixed by capturing
  `previous` INSIDE the writeChain queued closure, and deferring
  notify() until adapter.set() succeeds. As a side effect this also
  closes the double-notify-on-rollback flicker (REL-011 / V-F22).
  **Trade-off:** callers must `await update()` before reading the new
  value — corrected the regression test contract.

- **HealthChecker dead-lock after auto-trip (REL-002).** When
  `onConsecutiveFailures` flipped `healthCheckEnabled=false`, the
  poll callback called `stopPolling()` but left `started=true` and
  never re-armed the kill-switch watcher. User re-enable in Settings
  then did nothing — checker stayed dead until page reload. Now the
  auto-trip path calls `stop()` (resets `started`) plus
  `armReEnableWatcher()` (listens for re-enable).

### Security fixes (High)

- **KillSwitch state silently dropped on persist (SEC2-001).**
  `settingsStore.update({healing: ...})` was rejected by
  `sanitizePatch`'s whitelist — `healing` wasn't a declared Settings
  field. Defense-in-depth toggles (Discovery / Health-check) never
  reached disk; toggles silently re-enabled on every page reload.
  Comment in `kill-switch.ts` claiming "validator merges unknown
  fields as-is" was false. Fixed by declaring `healing` as an
  optional `{discoveryEnabled, healthCheckEnabled}` Settings field
  with a typed sub-validator (booleans only, proto-pollution strip).

- **TM migration unbounded inputs (SEC-001 + SEC-002).** Legacy-
  userscript localStorage migration is attacker-controlled (any host
  page script can pre-populate the migration key). Two issues:
  `JSON.parse(rawSettings)` had no size guard (a 5 MB blob froze the
  main thread on first install); `normalizeHotkeys` had no array
  length cap (a 10k-element array of valid hotkey objects slipped
  through and bloated stored settings). Fixed with a 256 KB pre-parse
  size cap (logged + skipped on overflow) and `.slice(0, 16)` on the
  hotkey array. Real settings are <2 KB, real users have ~5 hotkeys.

### Performance / Reliability (High)

- **Coalescing adapter swallowed all write errors silently (REL-004).**
  speedStore writes (slider drag, hotkey repeat, ratechange restore)
  used `.catch(() => {})`. Quota-exceeded was invisible. Added
  `onWriteError` callback on `CoalescingOptions`; speedStore wires it
  to `logger.warn`.

- **Settings modal rendered ALL FOUR tab panels every open (PERF-001).**
  Inactive tabs were built into the DOM and just `aria-hidden`-toggled
  — 4× DOM construction and listener-attach cost per modal open. Now
  only the active tab is rendered; tab switch re-runs the existing
  `rerenderSettings()` so behavior is unchanged. As a side effect,
  `attachSettingsHandlers`' 10 `querySelectorAll` walks (PERF-002)
  now traverse 1/4 the nodes.

- **Hydration observer watched whole `<body>` subtree (PERF-003).**
  YouTube fires thousands of mutations during cold load; each
  triggered our `checkYtHydrated()` `querySelector` + textContent
  read. Now scoped to `ytd-watch-metadata` → `#primary-inner` →
  `body` (in that order).

- **Hotkey listener resolved `<video>` on every keydown (PERF-004).**
  Every keystroke (including typing in the YouTube search bar) paid
  for `discovery.resolve('video')` and its `getBoundingClientRect()`
  validator call. Reordered: match the hotkey first, resolve only on
  hit.

- **RuTube bridge listener race + dead pong/dispose envelopes
  (REL-005 + PLAT-001 + SEC-004).** `rutube.ts` posted `pong`
  (handshake) and `dispose` (per-session cleanup) messages that
  `page-world.content.ts` never received. Dead protocol entries on
  paper; in practice they exposed `sessionId` to any in-page
  listener. Removed both broadcasts; `BridgeMessageType` narrowed to
  `'history-changed' | 'navigated'`. Bridge is now strictly one-way.

### Code cleanup

- **Deleted 8 dead barrel files** (`src/{app,discovery,health,i18n,sites,speed,storage,utils}/index.ts`).
  None had import sites — all modules already exposed their public
  API via direct sub-file imports. `ui/index.ts` stays (used by
  popup). ~50% of `src/` `index.ts` files removed.
- **Deleted `setSpeed`** — function existed but had zero call sites
  since the click-router refactor split it into
  `setTemporary`/`setGlobal`/`applyTransient`. Header JSDoc cleaned
  up; stale comments in `panel.ts` updated to reference current API.
- **Deleted dead exports**: `DEFAULT_PRESETS` in `ui/buttons.ts`
  (live data is in `config.ts`), `safeStorage` + `feature-detect.ts`
  whole files (unused).
- **Deleted dead i18n keys**: `menu.version_tip`, `donate.crypto.copied`
  (en + ru, both projects).
- **Deleted dead CSS**: `.vs-brand` block in `styles.ts`.

## [0.3.20] — 2026-05-10

### Bug fixes

- **Settings modal showed RED accent on RuTube** (should be RuTube
  cyan/blue). The bug was visible on the active "Right" tab, every
  selected speed-preset pill, the "+ Add" button, the toggle switches
  and the "Russian" language pill — all showed YouTube red even
  though the panel correctly applied the per-site palette.

  Root cause was a CSS-variable indirection trap. `--vs-menu-active-bg`
  (and the glow shadows / `--vs-toggle-on`) were declared at `:root`
  with values like `linear-gradient(135deg, var(--vs-accent-dark) 0%,
  var(--vs-accent-darker) 100%)`. Chrome substitutes nested `var()`
  inside a custom-property value at the **declaring element's**
  cascade, NOT at the consuming descendant's. So at `:root` the
  gradient froze with the default `--vs-accent-dark` (#cc0000 red),
  and descendants of `.vs-panel[data-vs-site="rutube"]` inherited
  the already-resolved-with-red gradient as a string — never seeing
  their panel-scoped blue override.

  Fix: re-declare every aggregate token inside the per-site selector
  itself, alongside the `--vs-accent-*` overrides. Substitution then
  happens at the panel's own cascade where `--vs-accent-dark` is the
  site colour, and inheritance carries the right gradient down.

## [0.3.19] — 2026-05-10

### Visual

- **Removed dark surface around the speed pills.** The `.speed-buttons-row`
  wrapper had a translucent dark/light surface (added in audit MAJ-13)
  meant to make the pill row read as a unit on near-black hosts. In
  practice it rendered as a foreign band that didn't match the host
  page's surrounding canvas — particularly visible on HDRezka where
  the page is uniformly dark and the wrapper produced a slightly
  different dark shade right around our buttons. Reverted to the
  original userscript look: each pill carries its own translucent
  surface, the row itself is fully transparent.

## [0.3.18] — 2026-05-10

### Bug fixes

- **Cropped buttons during YT load — second pass.** v0.3.17 added the
  visibility-deferred reveal but the `window.load` + 100 ms fallback
  was firing BEFORE YouTube's metadata column finished hydrating.
  YouTube is an SPA — `load` fires when the initial document and its
  static resources are done, but the metadata API call (which triggers
  the actual skeleton-end and the column's final layout) typically
  resolves later. So the panel was being un-hidden mid-skeleton,
  exactly into the cropped state v0.3.17 was meant to avoid.

  Changes:
  - Removed the `window.load` reveal trigger entirely. Reveal now
    fires only on (a) `ytd-watch-metadata h1` having non-empty text
    (observed via MutationObserver) or (b) the hard timeout.
  - Hard timeout raised from 1500 ms → 3000 ms. On slow connections
    YT's metadata response can exceed 1.5 s, and the previous timeout
    was firing before skeleton-end on those.
  - Reveal logic is now gated by `ctx.site === 'youtube'`. RuTube and
    other sites reveal the panel immediately (the cropping artifact
    is YT-specific — caused by the skeleton state's overflow:hidden
    on `#primary-inner`).

## [0.3.17] — 2026-05-10

### Bug fixes

- **Buttons visually cropped at the bottom during page load.** On
  YouTube the panel is appended to `#primary-inner > #below`, but
  during the loading-skeleton state YouTube briefly applies tight
  layout/clip rules to that subtree. Children inserted before the
  host has hydrated would render with their bottom third sliced off
  for a few hundred ms — visible until the SPA finishes its initial
  paint. We cannot influence YouTube's CSS, so the root-cause fix is
  to defer the panel's visibility until host hydration is observable.

  New mechanism (`scheduleHostHydrationReveal` in `panel.ts`):
  - Panel is created with `vs-panel--pending` (CSS:
    `visibility: hidden`).
  - Reveal triggers as soon as ANY of the following fires:
    1. `ytd-watch-metadata h1` (or generic `h1` on HDRezka) has
       non-empty text — the host's primary content has rendered.
    2. `MutationObserver` on `document.body` detects the same
       transition.
    3. `window.load` + 100 ms grace.
    4. A 1500 ms hard timeout (worst-case fallback, never longer).
  - All listeners are wired through the global cleanup so SPA-nav and
    teardown release them. Class is removed exactly once.

  `visibility: hidden` (not `display: none`) is intentional: the
  panel still reserves layout space, so removing the class doesn't
  reflow the page below by the panel's height.

## [0.3.16] — 2026-05-10

### Bug fixes

- **Panel ordering with the new pin button.** v0.3.15 added a pin
  button between the slider and the gear, but `applyLayoutImpl()` and
  the CSS grid templates for `sliderPosition='bottom'` (and the
  narrow-viewport auto-collapse `sliderPosition='right'`) still
  assumed the pre-pin two-control layout. On every layout call the JS
  would reorder children to `[buttons, pin, slider, gear]`, and the
  grid auto-placed pin into a random unfilled cell. On slow loads the
  result was a visible "panel looks truncated" first frame — slider
  briefly missing or in the wrong column — that recovered once the
  next applyLayout pass settled.

  Fixed by:
  - `applyLayoutImpl()` anchors `slider.nextSibling` against `pinBtn`
    instead of `gearWrapper` so the [buttons, slider, pin, gear]
    ordering is stable.
  - Grid templates for `sliderPosition='bottom'` and the narrow auto-
    collapse rule now declare `pin` as an explicit area:
    `"buttons pin gear ." / "slider slider slider ."`.

## [0.3.15] — 2026-05-10

### Behaviour change

- **Slider release no longer locks the dragged value as the new-video
  default.** Dragging the slider mid-video now applies the speed as a
  TEMPORARY (one-shot) — same semantics as a single button click. The
  next video starts at the user's saved default, not at the dragged
  value. Previously the slider's `change` event called `setSpeed()`
  which, with `rememberSpeed: true` (the install default), persisted
  the dragged value as the default for ALL future videos — a silent
  side-effect with no visual confirmation. Setting the new-video
  default is now an EXPLICIT action — either double-click on a preset
  (existing power-user shortcut) or the new pin button below.

### Added

- **Pin button — "Save current speed as default".** New circular
  button between the slider and the gear, bookmark-icon (matches the
  in-button saved-speed indicator). Click → applies `setGlobal()`:
  saves the currently-playing speed to `speedStore.current` + force-
  enables `rememberSpeed` + toasts confirmation. Discoverable
  alternative to the undocumented double-click-on-preset shortcut.
  Hover surfaces the same accent halo we use for the saved-speed
  indicator, signalling persistence.

## [0.3.14] — 2026-05-10

### Bug fixes (the actual root cause this time)

- **Settings menu: clear inline overrides BEFORE measuring.** The bug
  that v0.3.11/12/13 chased was caused by `adjustMenuPosition()`
  reading `settingsMenu.scrollHeight` while a stale inline `max-height`
  was still set from the previous call. `scrollHeight` reflects the
  CURRENT layout state — so what we thought was the "natural" height
  was actually the previous-call's clamp. The `naturalH > room` check
  then misfired (often comparing the clamp value to `room` and
  deciding "no clamp needed"), the inline `max-height` got removed,
  and the menu expanded past the viewport — header + tabs scrolled
  off as a side-effect. The next call would measure correctly,
  re-clamp, and the menu would "self-recover". Hence the alternating
  bug on every layout switch.

  Fixed by clearing all inline overrides (`max-height`, `data-vs-flip-y`,
  `data-vs-flip`, `left`, `right`) at the very top of
  `adjustMenuPosition()`, BEFORE any measurement. Then a single honest
  read informs flip-y + max-height decisions, and the writes go in
  one batch at the end. No oscillation.

## [0.3.13] — 2026-05-10

### Bug fixes (root-cause)

- **Settings menu: single-source-of-scroll fix.** v0.3.12 introduced a
  `.vs-menu-body` scroll container so the header + tabs would stay
  pinned. But `.vs-tab-panel` retained its own `max-height: 60vh +
  overflow-y: auto`, creating a NESTED scroll container inside the
  body's scroll. The two competed: `settingsMenu.scrollHeight` read in
  `adjustMenuPosition()` sometimes saw the inner-tab-panel ceiling
  instead of the actual content height, breaking the max-height +
  flip-y math and positioning the menu's top above the viewport —
  header + tabs scrolled off as a side effect of the misposition.
  Fixed by making `.vs-tab-panel` a flow-only container — single
  scroll source lives on `.vs-menu-body` only.

## [0.3.12] — 2026-05-10

### Bug fixes

- **Settings menu architecture: header + tabs are now sticky.** The
  previous v0.3.11 fix patched the symptom (resetting scrollTop on
  rerender), but the underlying issue was structural — the entire
  modal was a single scroll container, so on tall tabs the header
  and tabs scrolled out of view together with the body. Switching
  layouts repeatedly could leave the user viewing the middle of the
  menu with no visible way back to the tabs (the menu would
  eventually self-recover only when its content shrunk back).
  Now: a dedicated `.vs-menu-body` element owns `overflow-y: auto`,
  while `.vs-menu-header` and `.vs-tabs` stay pinned at the top of
  the modal via `flex-shrink: 0`. Header + tabs are ALWAYS visible
  regardless of how tall the active tab grows.

## [0.3.11] — 2026-05-10

### Bug fixes

- **Settings menu no longer breaks on layout switch.** When the user
  toggled `sliderPosition` from "Right" → "Bottom" → "Right", the
  modal kept its previous `scrollTop` and the frozen flip-y decision
  from before the switch — the user could end up viewing the bottom
  half of a freshly-rebuilt menu (header + tabs scrolled off the top)
  with no visible way to scroll back up. Now: scrollTop is reset on
  every rerender, and frozen flip-y is invalidated when sliderPosition
  changes so `adjustMenuPosition` recalculates from the new geometry.

### Layout

- **Auto-collapse "Right" to grid layout on narrow viewports.** When
  the viewport is below 1100px (YouTube primary column ≤ ~720px),
  buttons + slider + gear cannot fit in one row even with auto-wrap.
  We now apply a Bottom-style grid layout regardless of the user's
  saved choice. The saved `sliderPosition` is unchanged — when the
  viewport widens back, the panel returns to single-row "Right"
  layout automatically.
- **Settings hint** explains the auto-collapse next to the "Right"
  radio: «Авто: на узком экране ползунок переносится вниз. Ваш выбор
  сохранён и вернётся, когда места будет достаточно.» / "Auto: on
  narrow screens the slider wraps below — your choice is kept and
  restored when there is enough room." Visible only when the auto
  rule is currently firing (CSS-gated, no JS).

## [0.3.10] — 2026-05-10

### Layout

- **Auto-wrap on narrow viewports.** The panel + speed-buttons row now
  wrap to multiple lines when the available width is too small for the
  user's chosen `sliderPosition` to fit on one line. Previously the
  buttons + slider + gear group overflowed past the column boundary
  into YouTube's `#secondary` recommendations / filter chips, visibly
  overlapping. The user's chosen `sliderPosition` is preserved (no
  silent layout switch); the panel just wraps within that mode.

## [0.3.9] — 2026-05-10

Continuation of the audit-driven cleanup that started in 0.3.8. Three
grouped commits cover quick a11y/UX wins, real-but-edge-case bugs, and
high-impact performance optimizations.

### Visual

- **Pluralized "issues found" headline.** EN diagnostic tab now renders
  "1 issue found" instead of "1 issues found" when only one issue is
  detected. RU phrasing was already count-agnostic ("Найдено
  проблем: N").

### Accessibility / UX

- **Settings menu announced as `dialog`.** Gear button now exposes
  `aria-haspopup="dialog"` and `aria-expanded` state; the menu itself
  carries `role="dialog"` + `aria-modal="false"` + `aria-label`.
  Screen readers used to announce a "menu" role even though the popup
  is a tabbed dialog with form inputs.
- **Detached anchor for JSON-export.** No more host-page DOM mutation
  on every Settings → Export click.
- **Production console hygiene.** `console.info` lines from the content
  script and page-world bootstrap are now gated behind `import.meta
  .env.DEV`. Production users no longer see "content script loaded"
  / "page-world script loaded" / "history hook installed" /
  "Navigation API hook installed" in their devtools.

### Bug fixes

- **KillSwitch propagation across instances.** The KillSwitch now
  subscribes to SettingsStore so external writes (popup, future
  options page) propagate into the live content-script's cached state.
  Toggling discovery / health-check from the popup used to require a
  page reload to take effect.
- **HealthChecker re-arm without reload.** When health-check is OFF at
  bootstrap, the checker now arms a `subscribe()` watcher and starts
  itself the moment the user toggles it back ON.
- **Cache `persist()` chain bounded.** The previous unconditional
  `(pendingWrite ?? resolve()).then(...)` built an ever-growing
  promise chain on tight `bumpSuccess` loops — a memory leak on
  long-running tabs. Replaced with a one-in-flight + one-trailing
  pattern.
- **Firefox clipboard fallback.** Donate-section "Copy address" now
  falls back to `document.execCommand('copy')` via a hidden textarea
  when `navigator.clipboard.writeText()` rejects (Firefox MV3 / strict
  Edge configs without recent user gesture).
- **Welcome page ResizeObserver disconnect.** Language-switch path now
  disconnects observers from the previous render before
  `host.replaceChildren()`. Previously each EN→RU→EN round leaked 2
  observers on stages the host had since replaced.
- **Defensive `try/catch` around `isHealthy()` in diag-status update.**
  A thrown call (e.g. healthChecker not yet initialised) used to
  crash the entire status update, leaving the panel showing stale info.

### Performance

- **`adjustMenuPosition` reads/writes batched** (perf P1). Eliminates
  up to 4 forced synchronous reflows per call. The settings-modal
  rerender chain calls this on every settings change; the jank was
  visible on mobile.
- **`heuristicScan` for `playerContainer` is now an ancestor walk**
  (perf P2). The previous
  `Array.from(doc.querySelectorAll('div, section, article'))
  .filter(el => el.querySelector('video'))` was O(n_elements) ×
  O(subtree-query). On YouTube this iterated 800-2000+ outer nodes
  with a nested querySelector each, causing a CPU spike during cold
  load. New implementation is O(depth), bounded at 32 levels.
- **Settings handlers no longer double-rerender** (perf P3). 11
  redundant `deps.rerender()` calls after `settingsStore.update()`
  removed — the panel's settingsStore subscriber already triggers
  `rerenderSettings()` when the menu is open. Each click in the gear
  used to fire two full-modal rebuilds.
- **`translator.t()` uses `split().join()` instead of `new RegExp()`**
  (perf P4) for placeholder substitution. Saves the regex compile on
  every `t(key, vars)` call (~10 compilations per modal rerender).
- **Single shared `formatSpeed()`** in `ui/format.ts` (perf Q6) —
  buttons and slider used to have two near-identical formatters.

### Tests

- All 31 audit regression tests from 0.3.8 still pass; no new tests
  added for this round (changes covered by existing suite + browser
  smoke).

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
