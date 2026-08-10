import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultPresetsFor } from '../../src/config';
import { createTranslator } from '../../src/i18n/translator';
import { defaultSettings } from '../../src/storage/types';
import { refreshActiveButton, renderButtonsRow } from '../../src/ui/buttons';
import { showNotification } from '../../src/ui/notifications';
import { showSpeedPopup } from '../../src/ui/popup';
import { generateHotkeyBlock } from '../../src/ui/settings/hotkey-block';
import { renderSettingsMenu } from '../../src/ui/settings/modal';
import { renderSlider, setSliderValue } from '../../src/ui/slider';
import { injectStyles, removeStyles } from '../../src/ui/styles';

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('renderButtonsRow', () => {
  it('renders one button per speed with the correct label', () => {
    const row = renderButtonsRow({ speeds: [1, 1.5, 2, 1.25], current: 1 });
    const btns = row.querySelectorAll('button');
    expect(btns).toHaveLength(4);
    // Integers compact: "1x" not "1.0x". Fractions trim trailing zeros.
    expect(btns[0]?.textContent).toBe('1x');
    expect(btns[1]?.textContent).toBe('1.5x');
    expect(btns[2]?.textContent).toBe('2x');
    expect(btns[3]?.textContent).toBe('1.25x');
  });

  it('marks the button matching `current` as active', () => {
    const row = renderButtonsRow({ speeds: [1, 1.5, 2], current: 1.5 });
    expect(row.querySelector<HTMLButtonElement>('.speed-button.active')?.textContent).toBe('1.5x');
  });

  it('refreshActiveButton swaps the active class without re-render', () => {
    const row = renderButtonsRow({ speeds: [1, 1.5, 2], current: 1 });
    refreshActiveButton(row, 2);
    const active = row.querySelector<HTMLButtonElement>('.speed-button.active');
    expect(active?.textContent).toBe('2x');
  });

  it('per-site default presets include 1× as the reset anchor', () => {
    // Audit 2026-05-11 W3.3: the dead `DEFAULT_PRESETS` constant in
    // ui/buttons.ts was deleted; the live per-site data lives in
    // config.ts as `defaultPresetsFor(site)`. Test re-anchored.
    const yt = defaultPresetsFor('youtube');
    expect(yt).toContain(1);
    expect(yt).toContain(1.5);
    expect(yt).toContain(2);
    expect(yt).toContain(3.25);
    expect(yt.every((s) => s >= 1 && s <= 3.25)).toBe(true);
    const rt = defaultPresetsFor('rutube');
    expect(rt).toContain(1);
    expect(rt).toContain(3);
    expect(rt.every((s) => s >= 1 && s <= 3)).toBe(true);
  });
});

describe('renderSlider / setSliderValue', () => {
  it('renders an input + label tracking the value', () => {
    const c = renderSlider({ current: 1.5, min: 0.5, max: 4, step: 0.05 });
    const input = c.querySelector<HTMLInputElement>('.speed-slider');
    const label = c.querySelector<HTMLElement>('.speed-slider-label');
    expect(input?.value).toBe('1.5');
    // Label trims trailing zeros (parity with original userscript:
    // 1 → "1x", 1.5 → "1.5x"; matches buttons.ts formatSpeedLabel).
    expect(label?.textContent).toBe('1.5x');
    // Floating tooltip mirrors the same text.
    expect(c.querySelector<HTMLElement>('.speed-value')?.textContent).toBe('1.5x');
  });

  it('setSliderValue updates input + label + fill var', () => {
    const c = renderSlider({ current: 1, min: 1, max: 4 });
    setSliderValue(c, 2.5);
    expect(c.querySelector<HTMLInputElement>('.speed-slider')?.value).toBe('2.5');
    expect(c.querySelector<HTMLElement>('.speed-slider-label')?.textContent).toBe('2.5x');
    expect(c.querySelector<HTMLElement>('.speed-value')?.textContent).toBe('2.5x');
  });
});

describe('showSpeedPopup', () => {
  it('creates the popup node on first call and updates it on subsequent calls', () => {
    showSpeedPopup(1.5);
    const node = document.getElementById('speed-popup');
    expect(node?.textContent).toBe('1.50x');
    expect(node?.classList.contains('show')).toBe(true);

    showSpeedPopup(2.25);
    expect(document.getElementById('speed-popup')?.textContent).toBe('2.25x');
  });

  it('idempotent: a second call does not create a duplicate node', () => {
    showSpeedPopup(1);
    showSpeedPopup(2);
    expect(document.querySelectorAll('#speed-popup')).toHaveLength(1);
  });
});

describe('showNotification', () => {
  it('appends a toast inside #speed-notifications stack', () => {
    showNotification('hello world');
    const stack = document.getElementById('speed-notifications');
    expect(stack).toBeTruthy();
    expect(stack?.children.length).toBe(1);
    expect(stack?.textContent).toContain('hello world');
  });

  it('reuses the same stack across calls', () => {
    showNotification('one');
    showNotification('two');
    const stacks = document.querySelectorAll('#speed-notifications');
    expect(stacks).toHaveLength(1);
    expect(stacks[0]?.children.length).toBe(2);
  });

  it('escapes HTML-special chars in the text', () => {
    showNotification('<script>x</script>');
    const stack = document.getElementById('speed-notifications');
    // The angle brackets should NOT render as a real script tag.
    expect(stack?.querySelector('script')).toBe(null);
  });
});

/**
 * Helper: mount the rendered DocumentFragment / Element on a host so
 * queries hit the real DOM. Returns the host so callers can use
 * querySelector / hasAttribute / matches against the real shape.
 */
function mountModal(opts: Parameters<typeof renderSettingsMenu>[0]): HTMLElement {
  const host = document.createElement('div');
  host.appendChild(renderSettingsMenu(opts));
  return host;
}

describe('renderSettingsMenu', () => {
  it('contains all three tab buttons', () => {
    const host = mountModal({
      settings: defaultSettings('en'),
      site: 'youtube',
      i18n: createTranslator('en'),
      activeTab: 'general',
      scriptVersion: '0.1.0',
    });
    expect(host.querySelector('[data-vs-tab="general"]')).toBeTruthy();
    expect(host.querySelector('[data-vs-tab="hotkeys"]')).toBeTruthy();
    expect(host.querySelector('[data-vs-tab="diag"]')).toBeTruthy();
  });

  it('shows the YouTube-only "in player" slider position option', () => {
    const host = mountModal({
      settings: defaultSettings('en'),
      site: 'youtube',
      i18n: createTranslator('en'),
      activeTab: 'general',
      scriptVersion: '0.1.0',
    });
    expect(host.querySelector('[data-vs-pos="video"]')).toBeTruthy();
  });

  it('offers the in-player option on RuTube too, plus its hide-title/hide-premium toggles', () => {
    // Until 2026-08-10 this asserted the opposite. The option was gated on a
    // literal `site === 'youtube'` while RuTube's control-bar selectors had
    // been sitting in src/discovery/selectors.ts the whole time — so the mode
    // was withheld from a site that could host it. The gate now derives from
    // that table (`supportsInPlayerSlider`), which is also what
    // panel.applyLayout() consults, so the menu and the layout cannot disagree.
    const host = mountModal({
      settings: defaultSettings('en'),
      site: 'rutube',
      i18n: createTranslator('en'),
      activeTab: 'general',
      scriptVersion: '0.1.0',
    });
    expect(host.querySelector('[data-vs-pos="video"]')).toBeTruthy();
    expect(host.querySelector('input[name="hide-player-title"]')).toBeTruthy();
    expect(host.querySelector('input[name="hide-premium"]')).toBeTruthy();
  });

  it('marks the active tab via aria-selected', () => {
    const host = mountModal({
      settings: defaultSettings('en'),
      site: 'youtube',
      i18n: createTranslator('en'),
      activeTab: 'diag',
      scriptVersion: '0.1.0',
    });
    expect(host.querySelector('[data-vs-tab="diag"]')?.getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('[data-vs-tab="general"]')?.getAttribute('aria-selected')).toBe(
      'false',
    );
  });

  it('renders the language switcher with both English and Russian options', () => {
    const host = mountModal({
      settings: { ...defaultSettings('ru'), language: 'ru' },
      site: 'youtube',
      i18n: createTranslator('ru'),
      activeTab: 'general',
      scriptVersion: '0.1.0',
    });
    expect(host.querySelector('[data-vs-lang="en"]')).toBeTruthy();
    expect(host.querySelector('[data-vs-lang="ru"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-vs-lang="en"]')?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('generateHotkeyBlock', () => {
  it('emits one row per hotkey + add button + reset link', () => {
    const block = generateHotkeyBlock(
      'speedUp',
      [
        { ctrl: true, shift: false, alt: false, meta: false, key: 'KeyC' },
        { ctrl: false, shift: false, alt: false, meta: false, key: 'Insert' },
      ],
      'Speed up',
      'chevron-up',
      createTranslator('en'),
    );
    expect(block.querySelectorAll('.vs-hotkey-row').length).toBe(2);
    expect(block.querySelector('[data-vs-hotkey-add="speedUp"]')).toBeTruthy();
    expect(block.querySelector('[data-vs-hotkey-reset="speedUp"]')).toBeTruthy();
  });
});

describe('injectStyles / removeStyles', () => {
  it('appends a single <style> tag and is idempotent', () => {
    injectStyles('youtube');
    injectStyles('youtube');
    expect(document.querySelectorAll('style#vs-styles')).toHaveLength(1);
  });

  it('removeStyles drops the tag', () => {
    injectStyles('youtube');
    removeStyles();
    expect(document.querySelector('style#vs-styles')).toBe(null);
  });
});
