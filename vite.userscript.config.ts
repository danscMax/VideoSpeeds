/**
 * Vite config for the userscript build (Wave 3).
 *
 * Produces a single Tampermonkey-style .user.js file by reusing the same
 * src/ codebase the extension build uses. Differences:
 *   - Entry: src/entrypoints/userscript.entry.ts (wraps bootstrap with
 *     a synthetic ctx + a GM-storage adapter)
 *   - `wxt/browser` is aliased to a Proxy shim that throws on access --
 *     any code path reaching for `browser.storage.*` in the userscript
 *     build is a bug; this surfaces it loudly instead of silently no-op.
 *   - vite-plugin-monkey 7.x emits the @match/@grant header banner.
 *
 * Run via `npm run build:userscript` -> `dist-userscript/video-speeds.user.js`.
 */

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import monkey, { cdn } from 'vite-plugin-monkey';
import pkg from './package.json' with { type: 'json' };

void cdn; // imported for type guidance; we don't use any @require CDNs (keep bundle self-contained)

export default defineConfig({
  resolve: {
    alias: {
      // Force any `wxt/browser` import in shared src/ code to use our
      // Proxy shim. Production code paths never reach for browser.* in
      // the TM build (the orchestrator gets a GM-storage adapter), so
      // the shim is a safety net that throws loud on accidents.
      'wxt/browser': fileURLToPath(
        new URL('./src/userscript-shims/wxt-browser.ts', import.meta.url),
      ),
    },
  },
  build: {
    outDir: 'dist-userscript',
    emptyOutDir: true,
    target: 'es2022',
    minify: false, // user-readable output keeps the userscript easy to audit
  },
  plugins: [
    monkey({
      entry: 'src/userscript-entry.ts',
      userscript: {
        name: 'Video Speed Controller (YouTube + RuTube)',
        namespace: 'https://github.com/maxscorpy/video-speeds',
        version: pkg.version,
        description: pkg.description,
        author: 'MaxScorpy',
        license: 'GPL-3.0-or-later',
        match: ['*://*.youtube.com/*', '*://rutube.ru/*', '*://*.rutube.ru/*'],
        grant: ['GM_setValue', 'GM_getValue', 'GM_deleteValue', 'GM_listValues'],
        'run-at': 'document-idle',
      },
      build: {
        // Single-file output: keep the bundle in one .user.js (no
        // cross-file imports). vite-plugin-monkey defaults already do
        // this for the userscript chunk; we keep filename short for
        // friendly URLs.
        fileName: 'video-speeds.user.js',
      },
    }),
  ],
});
