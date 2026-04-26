/**
 * Single-action hotkey block: label + N hotkey-input rows + add + reset.
 *
 * Used twice in the Settings modal (speedUp, speedDown). Returns an HTML
 * string so it can be embedded into the modal template.
 */

import { vsIcon, type IconName } from '../icons';
import { escHtml } from '../../i18n/translator';
import { formatHotkey } from '../../speed/hotkeys';
import type { Hotkey } from '../../storage/types';
import type { Translator } from '../../app/ports';

export type HotkeyAction = 'speedUp' | 'speedDown';

export function generateHotkeyBlock(
  action: HotkeyAction,
  hotkeys: readonly Hotkey[],
  label: string,
  iconName: IconName,
  i18n: Translator,
): string {
  const slots = hotkeys
    .map(
      (h, i) => `
      <div class="vs-hotkey-row" data-hotkey-type="${action}" data-slot-index="${i}">
        <input type="text" class="vs-hotkey-input"
               placeholder="${escHtml(i18n.t('hotkeys.placeholder'))}"
               value="${escHtml(formatHotkey(h))}"
               tabindex="0" readonly
               title="${escHtml(i18n.t('hotkeys.input.tip'))}">
        <button type="button" class="vs-icon-button danger" data-vs-hotkey-remove
                title="${escHtml(i18n.t('hotkeys.remove.tip'))}">
          ${vsIcon('x', 14)}
        </button>
      </div>
    `,
    )
    .join('');

  return `
    <div class="vs-hotkey-block" data-hotkey-block="${action}">
      <div class="vs-hotkey-block-title">
        <span style="display:inline-flex; align-items:center; gap:6px;">
          ${vsIcon(iconName, 13)} ${escHtml(label)}
        </span>
      </div>
      <div class="vs-hotkey-list">${slots}</div>
      <button type="button" class="vs-add-button" data-vs-hotkey-add="${action}"
              title="${escHtml(i18n.t('hotkeys.add.tip'))}">
        ${vsIcon('plus', 14)} ${escHtml(i18n.t('hotkeys.add'))}
      </button>
      <button type="button" class="vs-reset-link" data-vs-hotkey-reset="${action}"
              title="${escHtml(i18n.t('hotkeys.reset.tip'))}">
        ${escHtml(i18n.t('hotkeys.reset'))}
      </button>
    </div>
  `;
}
