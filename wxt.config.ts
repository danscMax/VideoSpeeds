import { defineConfig } from 'wxt';

// WXT config: builds Chrome MV3 + Firefox MV3 from the same source.
// Browser-specific manifest tweaks are handled via the `manifest` callback below.
//
// Two content scripts are declared:
//   - content (isolated world): main logic, has chrome.* APIs
//   - page-world (MAIN world): runs in page context, can patch history.pushState etc.
//                              Modern alternative to <script>-tag injection (Chrome 95+).
export default defineConfig({
  srcDir: 'src',
  manifest: ({ browser }) => ({
    name: 'Video Speed Controller (YouTube + RuTube)',
    description:
      'Adds speed buttons, slider, and hotkeys to YouTube and RuTube videos. Bilingual interface (English/Russian).',
    version: '0.1.0',
    permissions: ['storage'],
    host_permissions: [
      '*://*.youtube.com/*',
      '*://*.piped.video/*',
      '*://rutube.ru/*',
      '*://*.rutube.ru/*',
    ],
    // Firefox needs explicit ID for AMO submission and storage isolation
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'video-speeds@maxscorpy',
              strict_min_version: '109.0',
            },
          },
        }
      : {}),
    // Lucide-style globe icon as default; we'll add real PNG icons later.
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    action: {
      default_popup: 'popup.html',
      default_title: 'Video Speed Controller',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
      },
    },
  }),
});
