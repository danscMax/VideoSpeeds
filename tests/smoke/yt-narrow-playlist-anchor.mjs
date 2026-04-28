// Verify 0.1.32 fix: panel must land in #primary-inner (above #below)
// on a YT narrow-viewport playlist video. Reproduces the user bug where
// the first insertion attempt picks ytd-watch-metadata fallback (lands
// in #below, after playlist + ads) and never migrates up.
import { chromium } from 'playwright';
import { mkdtempSync, cpSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.stdout.write('boot\n');
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const BUILD_DIR = resolve(REPO_ROOT, '.output', 'chrome-mv3');
const SHOT_DIR = 'C:/Temp/vs-yt-anchor';
if (!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
process.stdout.write(`build dir: ${BUILD_DIR} exists=${existsSync(BUILD_DIR)}\n`);

process.stdout.write('mkdtemp profile...\n');
const profileDir = mkdtempSync(join(tmpdir(), 'vs-pw-profile-'));
process.stdout.write(`profile at ${profileDir}\n`);

// Node's cpSync hangs on Cyrillic source paths (Node 24 on Windows reproduces
// reliably). Use a pre-copied ASCII directory passed via env var instead —
// the wrapper Bash command does `cp -r .output/chrome-mv3/. C:/Temp/.../ext`
// before invoking us.
const extDir = process.env.VS_EXT_DIR;
if (!extDir || !existsSync(extDir)) {
  process.stdout.write(`VS_EXT_DIR missing or invalid: ${extDir}\n`);
  process.exit(1);
}
process.stdout.write(`extension at ${extDir}\n`);

let ctx;
try {
  process.stdout.write('launching...\n');
  ctx = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 800, height: 800 },
    args: [
      `--disable-extensions-except=${extDir}`,
      `--load-extension=${extDir}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });
  process.stdout.write('launched ok\n');
} catch (e) {
  process.stdout.write(`LAUNCH FAILED: ${e.message}\n${e.stack}\n`);
  writeFileSync(`${SHOT_DIR}/launch-error.log`, `${e.message}\n${e.stack}\n`);
  process.exit(1);
}

const findings = [];
function log(msg) { console.log(msg); findings.push(msg); }

try {
  const page = await ctx.newPage();
  const consoleLogs = [];
  page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

  // Use a public playlist URL that triggers the same `#below`-with-playlist
  // structure as the user's report (RD-prefix = YT Mix / radio playlist).
  const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1';
  log(`navigating to ${URL} at viewport 800x800`);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  // YT polymer + content_idle + retry budget — give it generous time.
  await page.waitForTimeout(6_000);

  const initBanner = consoleLogs.find((l) => l.includes('[VIDEO-SPEEDS]'));
  log(`init banner: ${initBanner ?? '(missing!)'}`);

  // Probe the final panel location after the retry budget has had time
  // to migrate up to the preferred anchor.
  const probe = await page.evaluate(() => {
    const panel = document.querySelector('.vs-panel');
    const below = document.querySelector('#primary-inner > #below');
    const meta = document.querySelector('ytd-watch-metadata');
    const playlist = document.querySelector('ytd-playlist-panel-renderer');
    return {
      width: window.innerWidth,
      panelExists: !!panel,
      panelParent: panel?.parentElement?.tagName + '#' + (panel?.parentElement?.id || ''),
      panelPrev: panel?.previousElementSibling?.tagName + '#' + (panel?.previousElementSibling?.id || ''),
      panelNext: panel?.nextElementSibling?.tagName + '#' + (panel?.nextElementSibling?.id || ''),
      belowExists: !!below,
      metaParent: meta?.parentElement?.tagName + '#' + (meta?.parentElement?.id || ''),
      playlistParent: playlist?.parentElement?.tagName + '#' + (playlist?.parentElement?.id || ''),
      // Y-coordinates: panel must be ABOVE playlist for the user-visible fix.
      panelY: panel?.getBoundingClientRect().y,
      playlistY: playlist?.getBoundingClientRect().y,
    };
  });
  log('probe result:');
  log(JSON.stringify(probe, null, 2));

  // Verdicts
  const expectedParent = 'DIV#primary-inner';
  const parentOk = probe.panelParent === expectedParent;
  const orderOk = probe.playlistY == null || probe.panelY < probe.playlistY;

  log(`\nparent: ${parentOk ? 'PASS' : 'FAIL'} (expected ${expectedParent}, got ${probe.panelParent})`);
  log(`order:  ${orderOk ? 'PASS' : 'FAIL'} (panel y=${probe.panelY}, playlist y=${probe.playlistY})`);

  // Filter relevant content-script logs for diagnostics.
  log('\nrelevant console:');
  for (const l of consoleLogs) {
    if (l.includes('VIDEO-SPEEDS') || l.includes('panel inserted') || l.includes('tentative')) {
      log('  ' + l);
    }
  }

  // Save screenshot for visual inspection.
  try {
    await page.screenshot({ path: `${SHOT_DIR}/final.png`, fullPage: false });
    log(`\nscreenshot: ${SHOT_DIR}/final.png`);
  } catch (e) {
    log(`screenshot failed: ${e.message}`);
  }

  process.exitCode = parentOk && orderOk ? 0 : 1;
} finally {
  await ctx.close();
  try {
    rmSync(profileDir, { recursive: true, force: true });
    rmSync(extDir, { recursive: true, force: true });
  } catch {}
  writeFileSync(`${SHOT_DIR}/yt-narrow-playlist-anchor.log`, findings.join('\n'));
}
