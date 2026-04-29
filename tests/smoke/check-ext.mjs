// Check chrome://extensions for errors on our extension.
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9333');
const ctx = browser.contexts()[0];

const ext = await ctx.newPage();
await ext.goto('chrome://extensions/');
await new Promise(r => setTimeout(r, 1500));

const result = await ext.evaluate(async () => {
  const root = document.querySelector('extensions-manager');
  const items = root?.shadowRoot?.querySelector('extensions-item-list');
  const rows = Array.from(items?.shadowRoot?.querySelectorAll('extensions-item') ?? []);
  const out = [];
  for (const row of rows) {
    const name = row.shadowRoot?.querySelector('#name')?.textContent?.trim();
    const errorsBtn = row.shadowRoot?.querySelector('#errorsButton');
    const enableTog = row.shadowRoot?.querySelector('#enableToggle');
    const reloadBtn = row.shadowRoot?.querySelector('#dev-reload-button')
      ?? row.shadowRoot?.querySelector('cr-icon-button[id*=reload]');
    const id = row.id;
    const enabled = enableTog?.checked;
    out.push({
      id,
      name,
      enabled,
      errorsBtnExists: !!errorsBtn,
      reloadBtnExists: !!reloadBtn,
      reloadBtnHTML: reloadBtn?.outerHTML?.slice(0, 200),
    });
  }
  return out;
});
console.log('EXTENSIONS:', JSON.stringify(result, null, 2));

// If errorsBtn exists, click it to see errors
const ourId = result[0]?.id;
if (ourId) {
  await ext.evaluate(async (id) => {
    const root = document.querySelector('extensions-manager');
    const items = root?.shadowRoot?.querySelector('extensions-item-list');
    const rows = Array.from(items?.shadowRoot?.querySelectorAll('extensions-item') ?? []);
    for (const row of rows) {
      if (row.id === id) {
        const errorsBtn = row.shadowRoot?.querySelector('#errorsButton');
        errorsBtn?.click();
      }
    }
  }, ourId);
  await new Promise(r => setTimeout(r, 1000));
  const errors = await ext.evaluate(() => {
    const root = document.querySelector('extensions-manager');
    const errorPage = root?.shadowRoot?.querySelector('extensions-error-page');
    return errorPage?.shadowRoot?.querySelector('#mainContainer')?.textContent?.slice(0, 4000);
  });
  console.log('ERRORS PAGE:', errors);
}
await browser.close();
