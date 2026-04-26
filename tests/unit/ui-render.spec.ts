import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderButtonsRow, refreshActiveButton, DEFAULT_PRESETS } from '../../src/ui/buttons';
import { renderSlider, setSliderValue } from '../../src/ui/slider';
import { showSpeedPopup } from '../../src/ui/popup';
import { showNotification } from '../../src/ui/notifications';
import { renderSettingsMenu } from '../../src/ui/settings/modal';
import { generateHotkeyBlock } from '../../src/ui/settings/hotkey-block';
import { injectStyles, removeStyles } from '../../src/ui/styles';
import { defaultSettings } from '../../src/storage/types';
import { createTranslator } from '../../src/i18n/translator';

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

  it('exports per-site presets that include common speeds', () => {
    expect(DEFAULT_PRESETS.youtube).toContain(1);
    expect(DEFAULT_PRESETS.youtube).toContain(2);
    expect(DEFAULT_PRESETS.rutube).toContain(1);
    // RuTube max is 3.0; presets should respect that.
    expect(DEFAULT_PRESETS.rutube?.every((s) => s <= 3)).toBe(true);
  });
});

describe('renderSlider / setSliderValue', () => {
  it('renders an input + label tracking the value', () => {
    const c = renderSlider({ current: 1.5, min: 0.5, max: 4, step: 0.05 });
    const input = c.querySelector<HTMLInputElement>('.speed-slider');
    const label = c.querySelector<HTMLElement>('.speed-slider-label');
    expect(input?.value).toBe('1.5');
    expect(label?.textContent).toBe('1.50x');
  });

  it('setSliderValue updates input + label + fill var', () => {
    const c = renderSlider({ current: 1, min: 1, max: 4 });
    setSliderValue(c, 2.5);
    expect(c.querySelector<HTMLInputElement>('.speed-slider')?.value).toBe('2.5');
    expect(c.querySelector<HTMLElement>('.speed-slider-label')?.textContent).toBe('2.50x');
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

describe('renderSettingsMenu', () => {
  it('contains all three tab buttons', () => {
    const html = renderSettingsMenu({
      settings: defaultSettings('en'),
      site: 'youtube',
      i18n: createTranslator('en'),
      activeTab: 'general',
      scriptVersion: '0.1.0',
    });
    expect(html).toContain('data-vs-tab="general"');
    expect(html).toContain('data-vs-tab="hotkeys"');
    expect(html).toContain('data-vs-tab="diag"');
  });

  it('shows the YouTube-only "in player" slider position option', () => {
    const html = renderSettingsMenu({
      settings: defaultSettings('en'),
      site: 'youtube',
      i18n: createTranslator('en'),
      activeTab: 'general',
      scriptVersion: '0.1.0',
    });
    expect(html).toContain('data-vs-pos="video"');
  });

  it('omits the in-player option for RuTube and shows hide-title/hide-premium toggles', () => {
    const html = renderSettingsMenu({
      settings: defaultSettings('en'),
      site: 'rutube',
      i18n: createTranslator('en'),
      activeTab: 'general',
      scriptVersion: '0.1.0',
    });
    expect(html).not.toContain('data-vs-pos="video"');
    expect(html).toContain('name="hide-player-title"');
    expect(html).toContain('name="hide-premium"');
  });

  it('marks the active tab via aria-selected', () => {
    const html = renderSettingsMenu({
      settings: defaultSettings('en'),
      site: 'youtube',
      i18n: createTranslator('en'),
      activeTab: 'diag',
      scriptVersion: '0.1.0',
    });
    expect(html).toMatch(/data-vs-tab="diag"[^>]*aria-selected="true"/);
    expect(html).toMatch(/data-vs-tab="general"[^>]*aria-selected="false"/);
  });

  it('renders the language switcher with both English and Russian options', () => {
    const html = renderSettingsMenu({
      settings: { ...defaultSettings('ru'), language: 'ru' },
      site: 'youtube',
      i18n: createTranslator('ru'),
      activeTab: 'general',
      scriptVersion: '0.1.0',
    });
    expect(html).toContain('data-vs-lang="en"');
    expect(html).toContain('data-vs-lang="ru"');
    expect(html).toMatch(/data-vs-lang="ru"[^>]*aria-pressed="true"/);
  });
});

describe('generateHotkeyBlock', () => {
  it('emits one row per hotkey + add button + reset link', () => {
    const html = generateHotkeyBlock(
      'speedUp',
      [
        { ctrl: true, shift: false, alt: false, meta: false, key: 'KeyC' },
        { ctrl: false, shift: false, alt: false, meta: false, key: 'Insert' },
      ],
      'Speed up',
      'chevron-up',
      createTranslator('en'),
    );
    expect((html.match(/vs-hotkey-row/g) ?? []).length).toBe(2);
    expect(html).toContain('data-vs-hotkey-add="speedUp"');
    expect(html).toContain('data-vs-hotkey-reset="speedUp"');
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
