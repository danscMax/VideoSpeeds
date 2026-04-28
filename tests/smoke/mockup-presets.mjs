// Generate 3 visual mockups for the "manual speed input" UX options.
// Renders each variant in the live extension popup and screenshots it.
import { chromium } from 'playwright';

const b = await chromium.connectOverCDP('http://localhost:9333');
const ctx = b.contexts()[0];
const newP = await ctx.newPage();
await newP.goto('chrome://extensions/');
await newP.waitForTimeout(1500);
const ids = await newP.evaluate(() => {
  function* walk(root) {
    yield root;
    for (const el of root.querySelectorAll?.('*') ?? []) if (el.shadowRoot) yield* walk(el.shadowRoot);
  }
  const found = [];
  for (const node of walk(document)) {
    if (node.querySelectorAll) for (const el of node.querySelectorAll('extensions-item')) if (el.id) found.push(el.id);
  }
  return found;
});
await newP.close();

if (!ids.length) {
  console.error('no ext id');
  await b.close();
  process.exit(1);
}

const popupP = await ctx.newPage();
await popupP.goto(`chrome-extension://${ids[0]}/popup.html`);
await popupP.waitForTimeout(1500);
await popupP.evaluate(() => document.querySelector('[data-vs-tab="general"]')?.click());
await popupP.waitForTimeout(300);

// ─────────────────────── Mockup 1: inline input ───────────────────────
await popupP.evaluate(() => {
  const grid = document.querySelector('.vs-preset-grid');
  const reset = document.querySelector('[data-vs-preset-reset]');
  if (!grid || !reset) return;
  grid.parentElement.querySelectorAll('[data-mock]').forEach((el) => el.remove());
  const sl = grid.parentElement.querySelector('.vs-section-label');
  if (sl) sl.textContent = 'Опция 1 — inline input';

  const w = document.createElement('div');
  w.setAttribute('data-mock', '');
  w.style.cssText = 'display:flex; gap:8px; align-items:center; margin-top:10px;';
  const input = document.createElement('input');
  input.type = 'number';
  input.step = '0.01';
  input.placeholder = 'Например, 1.1';
  input.style.cssText =
    'flex:1; padding:6px 10px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); border-radius:8px; color:#fff; font-size:13px;';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '+ Добавить';
  btn.style.cssText =
    'padding:6px 14px; background:rgba(255,72,72,0.18); border:1px solid rgba(255,72,72,0.45); border-radius:8px; color:#fff; font-size:13px; font-weight:500; cursor:pointer;';
  w.appendChild(input);
  w.appendChild(btn);
  reset.parentElement.insertBefore(w, reset);
});
await popupP.waitForTimeout(200);
await popupP.screenshot({ path: 'C:/Temp/vs-yt-anchor/mockup-1.png', clip: { x: 0, y: 0, width: 380, height: 900 } });
console.log('saved mockup-1.png');

// ─────────────────────── Mockup 2: collapsible "+ своя" pill ───────────
await popupP.evaluate(() => {
  const grid = document.querySelector('.vs-preset-grid');
  const reset = document.querySelector('[data-vs-preset-reset]');
  const sl = grid.parentElement.querySelector('.vs-section-label');
  if (sl) sl.textContent = 'Опция 2 — пилюля «+ своя» раскрывает input';
  grid.parentElement.querySelectorAll('[data-mock]').forEach((el) => el.remove());

  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'vs-preset-pill';
  pill.setAttribute('data-mock', '');
  pill.textContent = '+ своя';
  pill.style.cssText = 'min-width:auto; padding:6px 14px;';
  grid.appendChild(pill);

  const expanded = document.createElement('div');
  expanded.setAttribute('data-mock', '');
  expanded.style.cssText = 'display:flex; gap:8px; align-items:center; margin-top:10px;';
  const input = document.createElement('input');
  input.type = 'number';
  input.step = '0.01';
  input.placeholder = '1.1';
  input.style.cssText =
    'flex:1; padding:6px 10px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); border-radius:8px; color:#fff; font-size:13px;';
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.textContent = 'OK';
  ok.style.cssText =
    'padding:6px 14px; background:rgba(255,72,72,0.18); border:1px solid rgba(255,72,72,0.45); border-radius:8px; color:#fff; font-size:13px; cursor:pointer;';
  expanded.appendChild(input);
  expanded.appendChild(ok);
  reset.parentElement.insertBefore(expanded, reset);
});
await popupP.waitForTimeout(200);
await popupP.screenshot({ path: 'C:/Temp/vs-yt-anchor/mockup-2.png', clip: { x: 0, y: 0, width: 380, height: 900 } });
console.log('saved mockup-2.png');

// ─────────────────────── Mockup 3: modal overlay ─────────────────────
await popupP.evaluate(() => {
  const grid = document.querySelector('.vs-preset-grid');
  const sl = grid.parentElement.querySelector('.vs-section-label');
  if (sl) sl.textContent = 'Опция 3 — модальное окно';
  grid.parentElement.querySelectorAll('[data-mock]').forEach((el) => el.remove());
  document.querySelectorAll('[data-mock-overlay]').forEach((el) => el.remove());

  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'vs-preset-pill';
  pill.setAttribute('data-mock', '');
  pill.textContent = '+ Своя скорость';
  pill.style.cssText = 'min-width:auto; padding:6px 14px;';
  grid.appendChild(pill);

  const overlay = document.createElement('div');
  overlay.setAttribute('data-mock-overlay', '');
  overlay.style.cssText =
    'position:fixed; inset:0; background:rgba(0,0,0,0.65); display:flex; align-items:center; justify-content:center; z-index:99999;';
  const modal = document.createElement('div');
  modal.style.cssText =
    'background:rgba(28,28,28,0.98); border:1px solid rgba(255,255,255,0.12); border-radius:14px; padding:20px; width:280px; box-shadow:0 20px 60px rgba(0,0,0,0.7);';
  const title = document.createElement('div');
  title.textContent = 'Добавить скорость';
  title.style.cssText = 'font-size:14px; font-weight:600; margin-bottom:12px;';
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.step = '0.01';
  inp.placeholder = 'Например, 1.1';
  inp.style.cssText =
    'width:100%; padding:8px 10px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.18); border-radius:8px; color:#fff; font-size:14px; box-sizing:border-box;';
  const hint = document.createElement('div');
  hint.textContent = 'Допустимо: 0.75x – 4x';
  hint.style.cssText = 'font-size:11px; opacity:0.55; margin-top:6px;';
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex; gap:8px; margin-top:16px; justify-content:flex-end;';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Отмена';
  cancel.style.cssText =
    'padding:6px 14px; background:transparent; border:1px solid rgba(255,255,255,0.18); border-radius:8px; color:#fff; font-size:13px; cursor:pointer;';
  const add = document.createElement('button');
  add.type = 'button';
  add.textContent = 'Добавить';
  add.style.cssText =
    'padding:6px 14px; background:rgba(255,72,72,0.25); border:1px solid rgba(255,72,72,0.55); border-radius:8px; color:#fff; font-size:13px; font-weight:500; cursor:pointer;';
  btnRow.appendChild(cancel);
  btnRow.appendChild(add);
  modal.appendChild(title);
  modal.appendChild(inp);
  modal.appendChild(hint);
  modal.appendChild(btnRow);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
});
await popupP.waitForTimeout(200);
await popupP.screenshot({ path: 'C:/Temp/vs-yt-anchor/mockup-3.png', clip: { x: 0, y: 0, width: 380, height: 900 } });
console.log('saved mockup-3.png');

await popupP.close();
await b.close();
