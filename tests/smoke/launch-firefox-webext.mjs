// Launch Firefox via Mozilla's official `web-ext run` tool — installs our
// extension as a Temporary Add-on (the same workflow as
// about:debugging → Load Temporary Add-on). Uses the Playwright-bundled
// Firefox binary so we don't depend on the user's system Firefox.
//
// We can't drive this Firefox via Playwright (it owns the RDP socket),
// so this script is intended for VISUAL verification only — open the
// browser, navigate to the URL, check the panel is in the right place.
// For automated DOM probes we have the Chromium smoke tests; the same
// TypeScript code paths run on both so a green Chromium suite + a
// healthy Firefox launch is the canonical "ships on both browsers" gate.

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const EXT_DIR = process.env.VS_EXT_DIR;
if (!EXT_DIR || !existsSync(EXT_DIR)) {
  console.error(`VS_EXT_DIR missing or invalid: ${EXT_DIR}`);
  process.exit(1);
}

// Find the Playwright-bundled Firefox binary. Path layout:
//   <local>/ms-playwright/firefox-<rev>/firefox/firefox.exe  (Win)
const playwrightCacheRoot = `${process.env.LOCALAPPDATA}/ms-playwright`;
const firefoxFolder = readdirSync(playwrightCacheRoot)
  .filter((d) => /^firefox-\d+$/.test(d))
  .sort()
  .at(-1);
if (!firefoxFolder) {
  console.error(
    `no firefox-<rev> dir under ${playwrightCacheRoot}; run "npx playwright install firefox"`,
  );
  process.exit(1);
}
const firefoxBin = join(playwrightCacheRoot, firefoxFolder, 'firefox', 'firefox.exe');
if (!existsSync(firefoxBin)) {
  console.error(`firefox.exe missing at ${firefoxBin}`);
  process.exit(1);
}
console.log(`firefox: ${firefoxBin}`);
console.log(`extension: ${EXT_DIR}`);

const URL =
  process.env.VS_URL ??
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1';

// Invoke `web-ext`'s JS entry point with `node` directly. We avoid both
// `npx` and shell:true here because:
//   1. shell:true on Windows runs through cmd.exe, which reinterprets the
//      `&` characters in the YT URL as command separators (`list` /
//      `start_radio` "is not a command" — bug found 2026-04-28).
//   2. Node 22+ rejects spawning `.cmd`/`.bat` with shell:false (EINVAL),
//      so the Windows-friendly `npx.cmd` workaround doesn't survive.
// Resolving the JS entry point of web-ext sidesteps both — we just
// execute a normal Node module.
const webExtJs = join(
  process.cwd(),
  'node_modules',
  'web-ext',
  'bin',
  'web-ext.js',
);
if (!existsSync(webExtJs)) {
  console.error(`web-ext entry not found at ${webExtJs}; run "npm ci"`);
  process.exit(1);
}
const child = spawn(
  process.execPath, // node
  [
    webExtJs,
    'run',
    `--source-dir=${EXT_DIR}`,
    `--firefox=${firefoxBin}`,
    `--start-url=${URL}`,
    '--no-reload',
    '--no-input',
  ],
  { stdio: 'inherit', shell: false },
);

child.on('exit', (code) => {
  console.log(`web-ext exited with code ${code}`);
  process.exit(code ?? 0);
});

// Forward signals so Ctrl+C kills the child.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig));
}
