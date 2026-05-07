# Contributing to Video Speed Controller (VideoSpeeds)

Thanks for your interest! This is a small but real codebase — pull
requests, bug reports, and translation fixes are all welcome.

If you only want to report a bug or suggest a feature, the in-extension
**Send feedback** form (gear menu → **Поддержать**, or the popup's
**Support** tab) is the lowest-friction path. It goes straight to the
maintainer's Telegram. No GitHub account needed.

If you want to send code, read on.

---

## Dev setup

Prerequisites: Node 22+, npm 10+.

```bash
git clone https://github.com/danscMax/VideoSpeeds.git
cd VideoSpeeds
npm install        # also runs `wxt prepare` for type generation
npm run dev        # Chrome MV3, hot reload
npm run dev:firefox  # Firefox MV3, hot reload
```

WXT will print a `chrome-extension://...` URL plus instructions to load
the unpacked extension once. After that, edits to `src/**` rebuild and
reload automatically.

---

## Sanity checks before pushing

```bash
npm run typecheck   # strict tsc --noEmit
npm test            # vitest unit tests
npm run zip         # Chrome MV3 zip in .output/
npm run zip:firefox # Firefox MV3 zip in .output/
```

For a deeper end-to-end pass:

```bash
npm run test:smoke      # Playwright smoke against YouTube + RuTube
npm run test:smoke:full # full audit (slower)
```

CI runs typecheck + unit tests + the chrome smoke test + a 500 KB
content-script bundle budget + `web-ext lint` against the Firefox
build on every PR. Run them locally and you'll catch ~all of what CI
would flag.

---

## Branching

- Cut feature branches off `main`, use `feature/<short-slug>` or
  `fix/<short-slug>`.
- Squash-merge by default. The PR title becomes the squash commit
  subject — keep it scannable (e.g. `youtube: detect theatre-mode
  layout shift`).
- Keep one logical change per PR. CI is fast; small PRs review faster.

---

## Code style

- TypeScript strict mode. No `any` without an inline justification
  comment.
- Comments in English (this is a hard rule even for RU-only code paths
  — keeps the codebase legible to outside contributors).
- No console.log left in the shipped bundle. Use the project `logger`
  from `src/utils/logger.ts`.
- Don't disable rules to make a build pass. If something looks
  red-flag, ask in the PR.

---

## Bilingual strings

User-facing text lives in `src/i18n/dict.ts`. Both `en` and `ru`
branches must stay in sync — TypeScript will yell at you if a key
exists in one and not the other. New strings: add the EN value first,
then the RU translation; keep them roughly the same length so layouts
don't break.

---

## Privacy & data handling

The extension's privacy posture is documented in [PRIVACY.md](./PRIVACY.md)
and reflected in the manifest's `data_collection_permissions`. Any
change that adds outbound network traffic, persisted user data, or new
permissions is a **major** change — open an issue first to discuss
before submitting the PR.

The Cloudflare Worker that backs the optional feedback flow lives in
the sibling [HDRezkaSpeeds](https://github.com/danscMax/HDRezkaSpeeds)
repo and is shared between both extensions. Worker changes go in that
repo; this repo only consumes the endpoint URL.

---

## Reporting bugs / requesting features

GitHub issues use templates — pick **Bug report** or **Feature
request** at <https://github.com/danscMax/VideoSpeeds/issues/new/choose>.

For most users the in-extension **Send feedback** form is faster and
doesn't require a GitHub account.
