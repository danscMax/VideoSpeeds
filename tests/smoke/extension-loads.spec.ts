import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test } from '@playwright/test';

// ESM context — derive __dirname manually (package.json has "type": "module").
const __dirname = dirname(fileURLToPath(import.meta.url));

// Smoke: extension loads, content script runs on YouTube, prints sanity log.
//
// Why we copy the build to a tmp ASCII path:
//   the project lives at E:\Scripts\Расширения\VideoSpeeds — Chrome's
//   --load-extension= flag rejects Cyrillic in the path on Windows.
//   We sidestep this by copying .output/chrome-mv3/ into an ASCII tmpdir
//   (e.g. C:\Users\<u>\AppData\Local\Temp\vs-ext-<rand>) before launching.
//   Linux/macOS CI runners don't need the workaround but the copy is cheap
//   so we always do it — keeps the test deterministic across hosts.

const REPO_ROOT = resolve(__dirname, '..', '..');
const BUILD_DIR = resolve(REPO_ROOT, '.output', 'chrome-mv3');

test.describe('extension smoke', () => {
  test.skip(
    !existsSync(BUILD_DIR),
    `Build output missing at ${BUILD_DIR} — run "npx wxt build" first.`,
  );

  test('content script bootstraps on youtube.com (DOM markers)', async () => {
    const profileDir = mkdtempSync(join(tmpdir(), 'vs-pw-profile-'));
    const extDir = mkdtempSync(join(tmpdir(), 'vs-ext-'));
    cpSync(BUILD_DIR, extDir, { recursive: true });

    const ctx = await chromium.launchPersistentContext(profileDir, {
      headless: false, // chromium ignores extensions in headless mode
      args: [
        `--disable-extensions-except=${extDir}`,
        `--load-extension=${extDir}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });

    try {
      const page = await ctx.newPage();
      const logs: string[] = [];
      page.on('console', (msg) => logs.push(msg.text()));

      await page.goto('https://www.youtube.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      // Production builds gate logger.info behind DEV (utils/logger.ts
      // minLevel='warn'), so there is NO console banner to wait for in a
      // release build. The reliable prod signal that bootstrap ran is the
      // DOM it mutates: injectStyles() writes data-vs-theme onto <html>
      // and inserts <style id="vs-styles">. Poll for those instead —
      // content_scripts run at document_idle, which on a slow page can
      // land well past a fixed pause.
      const deadline = Date.now() + 30_000;
      let markers: { theme: string | null; styles: boolean } = { theme: null, styles: false };
      while (!(markers.styles && markers.theme) && Date.now() < deadline) {
        markers = await page
          .evaluate(() => ({
            theme: document.documentElement.dataset.vsTheme ?? null,
            styles: !!document.getElementById('vs-styles'),
          }))
          .catch(() => ({ theme: null, styles: false }));
        if (!(markers.styles && markers.theme)) await page.waitForTimeout(500);
      }
      expect(
        markers.styles && !!markers.theme,
        `expected bootstrap DOM markers (vs-styles + data-vs-theme), got ${JSON.stringify(
          markers,
        )}; console:\n${logs.slice(0, 30).join('\n')}`,
      ).toBe(true);
    } finally {
      await ctx.close();
      try {
        rmSync(profileDir, { recursive: true, force: true });
        rmSync(extDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup; tmpdir reaper will get it eventually
      }
    }
  });
});
