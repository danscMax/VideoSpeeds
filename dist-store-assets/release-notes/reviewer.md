0.6.3 — onboarding only. No new permissions (still just "storage" plus the
same YouTube/RuTube host permissions), no new remote endpoints.

1. Default playback speed for a FRESH profile: RuTube 1.5 -> 1.0
   (src/config.ts SPEED_BOUNDS). Stored speeds are untouched — the value is
   only a fallback and the target of the "full reset" action.

2. New one-time hint chip on first panel render (src/index.ts
   showFirstRunHint + src/storage/onboarding-store.ts). Local flag in
   storage.local, no network.

3. welcome.html now also opens on runtime.onInstalled reason === 'update',
   and only when permissions.contains() reports no access — the Firefox case
   where a host permission gained in an update is not granted (bug 1893232)
   and the add-on is silently inert.

4. Copy fix: the welcome subtitle claimed "0.5-10x"; the real bounds are
   0.75 (YouTube) and 1.0 (RuTube).

Build: WXT + Vite, output minified; source archive attached.
Build it with `npm ci && npm run zip:firefox` on Node 22.
