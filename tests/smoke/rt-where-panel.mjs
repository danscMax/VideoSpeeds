// Diagnose where the RT panel landed: parent class, siblings around it,
// distance from .video-page-layout-module__player, and the full ancestor chain.
import { chromium } from 'playwright';
const PORT = 9333;

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
let rt = null;
for (const c of browser.contexts()) for (const p of c.pages()) if (p.url().includes('rutube.ru')) { rt = p; break; }
if (!rt) { console.error('no RT'); await browser.close(); process.exit(1); }

const data = await rt.evaluate(() => {
  const tag = (el) => {
    if (!el) return '<none>';
    const cls = (el.className && typeof el.className === 'string' ? el.className : '')
      .split(' ').filter(Boolean).slice(0, 3).join('.');
    const id = el.id ? '#' + el.id : '';
    return `<${el.tagName.toLowerCase()}${id}${cls ? '.' + cls : ''}>`;
  };

  const panel = document.querySelector('.vs-panel');
  const layoutPlayer = document.querySelector('[class*="video-page-layout-module__player"]');
  const layoutLeft = document.querySelector('[class*="video-page-layout-module__left"]');
  const h1 = document.querySelector('h1');

  const ancestors = [];
  let cur = panel?.parentElement;
  for (let i = 0; cur && i < 10; i++) { ancestors.push(tag(cur)); cur = cur.parentElement; }

  // What's above and below the panel within its parent?
  const parentChildren = panel?.parentElement
    ? Array.from(panel.parentElement.children).map((c, i) => ({
        i, tag: tag(c), isPanel: c === panel,
        rectTop: Math.round(c.getBoundingClientRect().top),
        rectHeight: Math.round(c.getBoundingClientRect().height),
      }))
    : [];

  // Where would we WANT to be? Right after the player wrapper.
  const wantedParent = layoutPlayer?.parentElement;
  const wantedSiblings = wantedParent
    ? Array.from(wantedParent.children).map((c, i) => ({
        i, tag: tag(c),
        isPanel: c === panel,
        isPlayer: c === layoutPlayer,
        rectTop: Math.round(c.getBoundingClientRect().top),
        rectHeight: Math.round(c.getBoundingClientRect().height),
      }))
    : null;

  return {
    panelRect: panel ? panel.getBoundingClientRect() : null,
    panelParent: tag(panel?.parentElement),
    panelAncestors: ancestors,
    panelSiblings: parentChildren,

    layoutPlayer: layoutPlayer ? {
      tag: tag(layoutPlayer),
      rect: layoutPlayer.getBoundingClientRect(),
      parent: tag(layoutPlayer.parentElement),
    } : null,
    layoutLeft: tag(layoutLeft),
    h1Top: h1?.getBoundingClientRect().top,

    // Sibling list of the player's parent — gives us the full layout column order.
    wantedParent: tag(wantedParent),
    wantedSiblings,

    // Is the panel currently a child of the player's parent?
    panelIsSiblingOfPlayer: !!(panel && layoutPlayer && panel.parentElement === layoutPlayer.parentElement),
  };
});

console.log(JSON.stringify(data, null, 2));
await browser.close();
