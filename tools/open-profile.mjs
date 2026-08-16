#!/usr/bin/env node
/**
 * Open the pw-firefox Playwright profile in a visible window, so the owner can
 * sign into Google ONCE by hand.
 *
 *   node tools/open-profile.mjs [url]
 *
 * Lives here rather than in plans/promotion/ because Node resolves imports
 * from the SCRIPT's directory, not the working directory: from the plans
 * folder the @playwright/test import failed with ERR_MODULE_NOT_FOUND no
 * matter where it was launched from, and the window silently never opened.
 *
 * Why this exists: the max-browser-login toolkit seeds a Chromium profile from
 * Firefox's cookie store, and that carries almost every site — but not Google.
 * Google binds the session to the device and to IndexedDB, so the transferred
 * cookies land on a sign-in page (verified 2026-08-10 against the Chrome Web
 * Store dashboard). The toolkit's own documented fix is a single manual login
 * into the profile, after which it holds.
 *
 * Nothing here reads or stores credentials: it launches the browser at the
 * dashboard URL and waits. Type the password into the browser window, the same
 * way you would in any browser, then close the window.
 *
 * NOTE: stop the pw-firefox MCP server before running this, or Chromium will
 * refuse the profile directory as busy.
 */
import { chromium } from '@playwright/test';
import { join } from 'node:path';

// Second argument picks WHICH seeded profile to open — the toolkit creates one
// directory per registered server (mcp-firefox, mcp-saashub, …), and a site the
// cookie transfer could not carry has to be signed into inside its own profile,
// not the shared one.
const PROFILE = join(
  process.env.LOCALAPPDATA ?? '',
  'ms-playwright',
  process.argv[3] ?? 'mcp-firefox',
);

// Any URL can be passed as the first argument — the catalogue sites (
// AlternativeTo, Slant, SaaSHub) need the same one-manual-login treatment as
// the dashboard, and they hold the session in this profile the same way.
const TARGET =
  process.argv[2] ??
  'https://chrome.google.com/webstore/devconsole/e4875649-412f-4341-af30-559e759f71ce/gppapgnbcdmpgeeccldopkgpagcdinlk/edit';

console.log(`profile: ${PROFILE}`);
console.log(`Opening ${TARGET}. Sign in, then just close the window — the`);
console.log('session stays in the profile.\n');

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: null,
  args: ['--no-first-run', '--no-default-browser-check'],
});

const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto(TARGET).catch(() => null);

// Stay alive until the window is closed by hand.
await new Promise((resolve) => ctx.on('close', resolve));
console.log('window closed — the profile now carries the session');
