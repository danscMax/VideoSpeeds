0.7.0 — adds two sites. This release DOES change the permission set, so the
relevant parts are listed first.

PERMISSIONS

1. optional_host_permissions gains dzen.ru and VK Video:
     *://dzen.ru/*, *://*.dzen.ru/*
     *://vkvideo.ru/*, *://*.vkvideo.ru/*
     *://vk.com/video*, *://vk.ru/video*
   These are OPTIONAL, not required. Nothing is requested at install time; the
   user grants a site from the extension popup after opening a video there.
   The VK patterns are deliberately path-scoped to the video section — the
   extension never runs on the rest of vk.com.

2. `activeTab` added to permissions. The popup needs the address of the tab it
   was opened from in order to show settings for that site and to offer the
   opt-in grant. Without it, tabs.query returns no URL for a host the extension
   has no permission for yet, so the grant button could never be reached.
   activeTab is scoped to the tab the user invoked the extension on; `tabs` was
   deliberately NOT used.

No new network endpoints. The only outbound call remains the feedback POST to
speeds-feedback.matsiyak.workers.dev, unchanged, and it is the sole entry in
connect-src.

BEHAVIOUR

3. src/sites/host-patterns.ts is now one table keyed by site; host_permissions,
   optional_host_permissions, the content-script matches and the MAIN-world
   history-hook matches are all derived from it rather than written out again.

4. src/discovery/selectors.ts — new entries for Dzen, measured on the live site.
   VK carries only one selector (from VK's own stylesheet); the rest of VK is
   resolved by the existing heuristic strategy, because VK's player does not
   initialise under an automated browser and its DOM could not be measured.

5. src/ui/styles.ts — the in-player slider is no longer hidden in fullscreen,
   and the speed confirmation now uses one anchor (top centre) in both windowed
   and fullscreen modes instead of two.

Build: WXT + Vite, output minified; source archive attached.
Build it with `npm ci && npm run zip:firefox` on Node 22.
