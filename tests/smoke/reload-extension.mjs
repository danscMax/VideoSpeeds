// Reload the unpacked extension via chrome://extensions Shadow DOM.
// Avoids restarting Chrome -- useful while iterating during this debug session.
import { chromium } from 'playwright';

const PORT = 9333;
const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
try {
  let extPage = null;
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (p.url().startsWith('chrome://extensions')) { extPage = p; break; }
    }
    if (extPage) break;
  }
  if (!extPage) {
    console.error('chrome://extensions tab not open');
    process.exit(1);
  }

  // Pierce the Shadow DOM down to the reload button. The extension manager
  // ships a multi-level shadow tree -- we walk it manually.
  const result = await extPage.evaluate(() => {
    const mgr = document.querySelector('extensions-manager');
    if (!mgr) return { error: 'no extensions-manager' };
    const list = mgr.shadowRoot.querySelector('extensions-item-list');
    if (!list) return { error: 'no extensions-item-list' };
    const items = list.shadowRoot.querySelectorAll('extensions-item');
    if (!items.length) return { error: 'no items' };
    const out = [];
    for (const it of items) {
      const id = it.getAttribute('id');
      const reloadBtn = it.shadowRoot.querySelector('#dev-reload-button');
      if (reloadBtn) {
        reloadBtn.click();
        out.push({ id, clicked: true });
      } else {
        out.push({ id, clicked: false, reason: 'no reload button -- not unpacked?' });
      }
    }
    return out;
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
