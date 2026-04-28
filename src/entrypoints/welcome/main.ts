/**
 * Welcome page renderer. Opened in a new tab on first install via
 * background.ts -> chrome.runtime.onInstalled.
 *
 * Built programmatically with our DOM helpers (no innerHTML / no
 * createContextualFragment) so this entrypoint stays parser-API-free
 * and Mozilla's static analyzer doesn't flag it.
 *
 * Content principles (per 2026 Chrome Best Practices and the
 * extensionbooster onboarding guide):
 *   - 60-second rule: get user to first "aha" without scrolling
 *   - Progressive disclosure: 4 cards, one feature each
 *   - Show key shortcuts inline rather than walls of text
 *   - Skipable CTA, no forced flow
 */

import { h, svgEl } from '../../ui/dom-h';
import { vsIcon, vsFilledGearIcon } from '../../ui/icons';
import { detectBrowserLang } from '../../i18n/detect';
import { createTranslator } from '../../i18n/translator';

declare const __VS_VERSION__: string | undefined;
const SCRIPT_VERSION =
  typeof __VS_VERSION__ === 'string' ? __VS_VERSION__ : '0.1.0';

const root = document.getElementById('welcome-app');
if (root) renderWelcome(root);

function renderWelcome(host: HTMLElement): void {
  const lang = detectBrowserLang();
  const { t } = createTranslator(lang);

  // ---- Hero: brand mark, title, subtitle, supported sites ---------------

  const heroIcon = h(
    'div',
    { class: 'welcome-icon' },
    vsFilledGearIcon(56),
  );

  const hero = h(
    'div',
    { class: 'welcome-hero' },
    heroIcon,
    h('h1', { class: 'welcome-title' }, t('welcome.title')),
    h('p', { class: 'welcome-subtitle' }, t('welcome.subtitle')),
    h(
      'div',
      { class: 'welcome-sites' },
      h(
        'span',
        { class: 'welcome-site-pill', 'data-site': 'youtube' },
        h('span', { class: 'dot' }),
        h('strong', {}, 'YouTube'),
      ),
      h(
        'span',
        { class: 'welcome-site-pill', 'data-site': 'rutube' },
        h('span', { class: 'dot' }),
        h('strong', {}, 'RuTube'),
      ),
    ),
  );

  // ---- 4 cards: clicks, hotkeys, custom, pin ----------------------------

  const card = (
    num: string,
    title: string,
    body: HTMLElement,
  ): HTMLElement =>
    h(
      'div',
      { class: 'welcome-card' },
      h(
        'div',
        { class: 'welcome-card-header' },
        h('div', { class: 'welcome-card-num' }, num),
        h('h2', { class: 'welcome-card-title' }, title),
      ),
      body,
    );

  // Card 1: click semantics — the headline thing the user asked us to
  // teach. Single click = temporary, double click = save as default.
  const clicksBody = h(
    'p',
    { class: 'welcome-card-body' },
    t('welcome.card.clicks.line1'),
    h('br'),
    t('welcome.card.clicks.line2'),
    h('br'),
    t('welcome.card.clicks.line3'),
  );

  // Card 2: hotkeys — shows the default Ctrl+C / Ctrl+V combos and
  // notes they are rebindable.
  const hotkeysBody = h(
    'p',
    { class: 'welcome-card-body' },
    t('welcome.card.hotkeys.line1'),
    h('br'),
    h('span', { class: 'welcome-key' }, 'Ctrl'),
    ' + ',
    h('span', { class: 'welcome-key' }, 'C'),
    ' — ',
    t('welcome.card.hotkeys.faster'),
    h('br'),
    h('span', { class: 'welcome-key' }, 'Ctrl'),
    ' + ',
    h('span', { class: 'welcome-key' }, 'V'),
    ' — ',
    t('welcome.card.hotkeys.slower'),
    h('br'),
    h('span', { class: 'welcome-card-body', style: 'opacity:0.7;' }, t('welcome.card.hotkeys.rebind')),
  );

  // Card 3: custom speed buttons — 0.5x to 10x, point them at Settings.
  const customBody = h(
    'p',
    { class: 'welcome-card-body' },
    t('welcome.card.custom.line1'),
    h('br'),
    t('welcome.card.custom.line2'),
  );

  // Card 4: pin guidance — the sequence Puzzle -> List -> Pin.
  const pinBody = h(
    'div',
    {},
    h('p', { class: 'welcome-card-body' }, t('welcome.card.pin.body')),
    h(
      'div',
      { class: 'welcome-pin-steps' },
      h(
        'span',
        { class: 'pin-step' },
        puzzleIcon(),
        ' ',
        t('welcome.card.pin.step1'),
      ),
      h('span', { class: 'pin-arrow' }, '›'),
      h('span', { class: 'pin-step' }, t('welcome.card.pin.step2')),
      h('span', { class: 'pin-arrow' }, '›'),
      h(
        'span',
        { class: 'pin-step' },
        pinIcon(),
        ' ',
        t('welcome.card.pin.step3'),
      ),
    ),
  );

  const cards = h(
    'div',
    { class: 'welcome-cards' },
    card('1', t('welcome.card.clicks.title'), clicksBody),
    card('2', t('welcome.card.hotkeys.title'), hotkeysBody),
    card('3', t('welcome.card.custom.title'), customBody),
    card('4', t('welcome.card.pin.title'), pinBody),
  );

  // ---- Donate hint -----------------------------------------------------

  const heart = vsIcon('heart', 28);
  heart.classList.add('welcome-donate-heart');

  const donate = h(
    'div',
    { class: 'welcome-donate' },
    heart,
    h('h3', {}, t('welcome.donate.title')),
    h('p', {}, t('welcome.donate.body')),
    h(
      'div',
      { class: 'welcome-donate-actions' },
      h(
        'a',
        {
          class: 'welcome-donate-link',
          href: 'https://pay.cloudtips.ru/p/9b14d4f1',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        t('welcome.donate.cloudtips'),
      ),
      h(
        'a',
        {
          class: 'welcome-donate-link',
          href: '#',
          'data-vs-open-popup': '',
        },
        t('welcome.donate.more'),
      ),
    ),
  );

  // ---- Primary CTA -----------------------------------------------------

  const ytBtn = h(
    'a',
    {
      class: 'welcome-cta welcome-cta-primary',
      href: 'https://www.youtube.com/',
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    t('welcome.cta.youtube'),
  );

  const closeBtn = h(
    'button',
    {
      type: 'button',
      class: 'welcome-cta welcome-cta-secondary',
      'data-vs-close': '',
    },
    t('welcome.cta.gotit'),
  );
  closeBtn.addEventListener('click', () => {
    // Tab-close needs a window.close; works on the welcome tab because
    // it was opened by the extension itself (browser.tabs.create above
    // marks the tab as scriptable).
    window.close();
  });

  const cta = h('div', { class: 'welcome-cta-row' }, ytBtn, closeBtn);

  // ---- Footer version --------------------------------------------------

  const version = h(
    'div',
    { class: 'welcome-version' },
    `v${SCRIPT_VERSION}`,
  );

  // ---- Compose --------------------------------------------------------

  host.replaceChildren(hero, cards, donate, cta, version);
}

/* ------------------------------------------------------------------ *
 * Tiny inline icons — kept here rather than added to the global icon  *
 * set because they are only used on the welcome page.                  *
 * ------------------------------------------------------------------ */

function puzzleIcon(): SVGElement {
  // Minimal "puzzle" glyph — Chrome's toolbar Extensions icon.
  return svgEl(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: 14,
      height: 14,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
    svgEl('path', {
      d:
        'M19.4 11a2 2 0 0 0 0 4 1 1 0 0 1 1 1v3a2 2 0 0 1-2 2h-3a1 1 0 0 1-1-1 2 2 0 0 0-4 0 1 1 0 0 1-1 1H6a2 2 0 0 1-2-2v-3a1 1 0 0 1 1-1 2 2 0 0 0 0-4 1 1 0 0 1-1-1V6a2 2 0 0 1 2-2h3a1 1 0 0 0 1-1 2 2 0 0 1 4 0 1 1 0 0 0 1 1h3a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1z',
    }),
  );
}

function pinIcon(): SVGElement {
  return svgEl(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: 14,
      height: 14,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
    svgEl('line', { x1: 12, y1: 17, x2: 12, y2: 22 }),
    svgEl('path', {
      d: 'M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1V4H8v2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z',
    }),
  );
}
