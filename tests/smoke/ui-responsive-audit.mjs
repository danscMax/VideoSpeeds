// Adaptive UI audit v2 — fixes selector for settings menu (.settings-menu)
// and skips the intentionally-hidden .speed-slider-label in panel layout.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const PORT = 9333;
const OUT = 'C:/Temp/vs-ui-review';

const VIEWPORTS = [
  { name: 'desktop-1920', width: 1920, height: 1080, dpr: 1 },
  { name: 'desktop-1366', width: 1366, height: 768, dpr: 1 },
  { name: 'tablet-768',   width: 768,  height: 1024, dpr: 2 },
  { name: 'mobile-l-667', width: 667,  height: 375,  dpr: 2 },
  { name: 'mobile-375',   width: 375,  height: 667,  dpr: 2 },
];

const SITES = ['rutube.ru', 'youtube.com'];

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const allFindings = [];

async function findPage(host) {
  for (const c of browser.contexts())
    for (const p of c.pages())
      if (p.url().includes(host)) return p;
  return null;
}

function probeJS(viewport) {
  return `(() => {
    const vp = ${JSON.stringify(viewport)};
    const issues = [];
    const out = { issues, vp, panel: null, menu: null };
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    };
    const overflowsViewport = (r, label) => {
      if (r.right > vp.width + 0.5)  issues.push({ sev: 'high', e: label, msg: 'overflows right by ' + Math.round(r.right - vp.width) + 'px' });
      if (r.left < -0.5)             issues.push({ sev: 'high', e: label, msg: 'overflows left by ' + Math.round(-r.left) + 'px' });
      if (r.top < -0.5)              issues.push({ sev: 'high', e: label, msg: 'top above viewport by ' + Math.round(-r.top) + 'px' });
      if (r.bottom > vp.height + 0.5) issues.push({ sev: 'med', e: label, msg: 'bottom below viewport by ' + Math.round(r.bottom - vp.height) + 'px' });
    };

    const panel = document.querySelector('.vs-panel');
    if (!panel) {
      issues.push({ sev: 'critical', e: 'panel', msg: 'panel not in DOM' });
      return out;
    }
    const pr = panel.getBoundingClientRect();
    out.panel = { x: Math.round(pr.x), y: Math.round(pr.y), w: Math.round(pr.width), h: Math.round(pr.height) };
    overflowsViewport(pr, 'panel');
    if (pr.width < 100) issues.push({ sev: 'high', e: 'panel', msg: 'too narrow ' + Math.round(pr.width) + 'px' });

    // Buttons row
    const row = panel.querySelector('.speed-buttons-row');
    if (row) {
      const rr = row.getBoundingClientRect();
      if (rr.right > pr.right + 0.5) issues.push({ sev: 'high', e: 'buttons-row', msg: 'overflows panel-right by ' + Math.round(rr.right - pr.right) + 'px' });
      const buttons = row.querySelectorAll('.speed-button');
      for (const b of buttons) {
        const r = b.getBoundingClientRect();
        if (r.height < 18 && r.height > 0) issues.push({ sev: 'high', e: 'speed-button', msg: 'too short ' + Math.round(r.height) + 'px ("' + b.textContent + '")' });
      }
      // Wrap detection — informational only on narrow viewports
      if (buttons.length >= 2) {
        const first = buttons[0].getBoundingClientRect();
        const last = buttons[buttons.length - 1].getBoundingClientRect();
        if (Math.abs(first.top - last.top) > 2) {
          const sev = vp.width < 600 ? 'info' : 'med';
          issues.push({ sev, e: 'buttons-row', msg: 'wraps to multiple lines' });
        }
      }
    }

    // Slider — only check the visible parts (panel layout hides .speed-slider-label by design)
    const slider = panel.querySelector('.speed-slider');
    if (slider && isVisible(slider)) {
      const sr = slider.getBoundingClientRect();
      if (sr.width < 50) issues.push({ sev: 'high', e: 'slider', msg: 'too narrow ' + Math.round(sr.width) + 'px' });
      if (sr.right > pr.right + 0.5) issues.push({ sev: 'high', e: 'slider', msg: 'overflows panel-right by ' + Math.round(sr.right - pr.right) + 'px' });
    }

    // Gear button
    const gear = panel.querySelector('.vs-gear-button');
    if (gear) {
      const gr = gear.getBoundingClientRect();
      if (gr.width < 24 || gr.height < 24) issues.push({ sev: 'med', e: 'gear', msg: 'a11y target ' + Math.round(gr.width) + 'x' + Math.round(gr.height) + 'px (<24)' });
      if (gr.right > pr.right + 0.5) issues.push({ sev: 'high', e: 'gear', msg: 'overflows panel-right by ' + Math.round(gr.right - pr.right) + 'px' });
    }

    // Settings menu — correct class is .settings-menu (with .show for visible)
    const menu = document.querySelector('.vs-panel .settings-menu.show, .vs-panel .settings-menu');
    if (menu && isVisible(menu)) {
      const mr = menu.getBoundingClientRect();
      out.menu = { x: Math.round(mr.x), y: Math.round(mr.y), w: Math.round(mr.width), h: Math.round(mr.height) };
      overflowsViewport(mr, 'settings-menu');
      // Tab pills
      const tabs = menu.querySelectorAll('[data-vs-tab]');
      for (const t of tabs) {
        const tr = t.getBoundingClientRect();
        if (tr.right > mr.right + 0.5) issues.push({ sev: 'med', e: 'tab', msg: 'tab "' + t.dataset.vsTab + '" overflows menu-right' });
      }
      // Hotkey rows
      const hkRows = menu.querySelectorAll('.vs-hotkey-row');
      for (const hr of hkRows) {
        const r = hr.getBoundingClientRect();
        if (r.right > mr.right + 0.5) issues.push({ sev: 'high', e: 'hotkey-row', msg: 'overflows menu-right by ' + Math.round(r.right - mr.right) + 'px' });
      }
      // Inputs
      const inputs = menu.querySelectorAll('input[type=text], input[type=checkbox], button');
      for (const inp of inputs) {
        if (!isVisible(inp)) continue;
        const r = inp.getBoundingClientRect();
        if (r.height < 22 && inp.tagName === 'INPUT' && (inp.type === 'text' || inp.type === 'search')) {
          issues.push({ sev: 'med', e: 'input', msg: 'text input <22px height (' + Math.round(r.height) + 'px)' });
        }
      }
      // Z-index check: top edge of menu — should not have anything overlay'd
      const cx = mr.x + mr.width / 2;
      const cy = mr.y + 10;
      const top = document.elementFromPoint(cx, cy);
      if (top && top !== menu && !menu.contains(top)) {
        // Walk up to see if it's in the menu lineage
        let cur = top, inMenu = false;
        while (cur) { if (cur === menu) { inMenu = true; break; } cur = cur.parentElement; }
        if (!inMenu) {
          issues.push({ sev: 'high', e: 'z-index', msg: 'foreign element on top of menu: ' + (top.tagName + (top.className && typeof top.className === 'string' ? '.' + top.className.split(' ').slice(0,2).join('.') : '')) });
        }
      }
      // Menu vertical scroll detection
      if (menu.scrollHeight > menu.clientHeight + 1) {
        issues.push({ sev: 'info', e: 'menu', msg: 'has internal vertical scroll: ' + menu.scrollHeight + ' > ' + menu.clientHeight });
      }
    }

    return out;
  })()`;
}

async function setViewport(page, vp) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: vp.width, height: vp.height,
    deviceScaleFactor: vp.dpr, mobile: vp.width <= 768,
  });
  return cdp;
}

async function shot(cdp, name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
}

for (const host of SITES) {
  const page = await findPage(host);
  if (!page) { console.log(`SKIP ${host}: no tab open`); continue; }
  console.log(`\n=== ${host} ===`);

  for (const vp of VIEWPORTS) {
    const cdp = await setViewport(page, vp);
    try { await page.reload({ waitUntil: 'domcontentloaded' }); } catch {}
    await new Promise(r => setTimeout(r, 4500));

    // 1) Default state probe
    const probe1 = await page.evaluate(probeJS(vp));
    if (probe1.panel) {
      try { await page.evaluate(`document.querySelector('.vs-panel')?.scrollIntoView({block:'center', behavior:'instant'})`); } catch {}
      await new Promise(r => setTimeout(r, 300));
    }
    await shot(cdp, `${host.split('.')[0]}-${vp.name}-1-default`);

    // 2) Open settings menu via gear click
    let probe2 = null;
    try {
      await page.evaluate(`document.querySelector('.vs-gear-button')?.click()`);
      await new Promise(r => setTimeout(r, 700));
      probe2 = await page.evaluate(probeJS(vp));
      await shot(cdp, `${host.split('.')[0]}-${vp.name}-2-menu`);
      // Try hotkeys tab
      try {
        await page.evaluate(`document.querySelector('[data-vs-tab="hotkeys"]')?.click()`);
        await new Promise(r => setTimeout(r, 400));
        const probe3 = await page.evaluate(probeJS(vp));
        await shot(cdp, `${host.split('.')[0]}-${vp.name}-3-hotkeys`);
        if (probe3.issues.length) probe2.issues.push(...probe3.issues.map(i => ({ ...i, e: 'hk-tab.' + i.e })));
      } catch {}
      // Close
      await page.keyboard.press('Escape').catch(()=>{});
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      probe2 = { issues: [{ sev: 'critical', e: 'menu-open', msg: e.message }] };
    }

    const issues = [...(probe1.issues || []), ...(probe2?.issues || [])];
    allFindings.push({ host, viewport: vp.name, panelRect: probe1.panel, menuRect: probe2?.menu, issues });
    console.log(`[${vp.name}] panel=${probe1.panel ? probe1.panel.w+'x'+probe1.panel.h : 'MISSING'}  menu=${probe2?.menu ? probe2.menu.w+'x'+probe2.menu.h : 'MISSING'}  issues=${issues.length}`);
    for (const it of issues) console.log(`    [${it.sev}] ${it.e}: ${it.msg}`);

    await cdp.send('Emulation.clearDeviceMetricsOverride').catch(()=>{});
  }
}

writeFileSync(`${OUT}/findings.json`, JSON.stringify(allFindings, null, 2));
console.log(`\nfindings written to ${OUT}/findings.json`);
console.log(`screenshots in ${OUT}/`);
await browser.close();
