/**
 * Donate section — three options at the bottom of the Diagnostics tab:
 *   - CloudTips link (Russian cards, opens in a new tab)
 *   - Toncoin TON address (copy to clipboard)
 *   - USDT TRC20 address (copy to clipboard)
 *
 * Why these three:
 *   - CloudTips: cheapest, simplest path for users with Russian cards
 *     (5-7% commission, no registration needed by donor).
 *   - TON / USDT TRC20: universal, work for foreign donors regardless of
 *     sanctions or PayPal availability. Crypto in 2026 is the only
 *     reliable way for international users to support a Russian author.
 *
 * Click handlers are attached at element-creation time. The settings modal
 * `replaceChildren`s the rendered DOM on every rerender, so the previous
 * buttons + their listeners are removed atomically — no leak, no need for
 * a CleanupRegistry hookup.
 */

import { h } from '../dom-h';
import { showNotification } from '../notifications';
import type { Translator } from '../../app/ports';

const CLOUDTIPS_URL = 'https://pay.cloudtips.ru/p/9b14d4f1';
const TON_ADDRESS = 'UQBMEMUpZZmrnnZoFseXuewWD1RkyVYw5EuBqTAOIl-AuOgM';
const USDT_TRC20_ADDRESS = 'TLuHigjqe8gjwfidfi2F7SZ4z27e4uShS6';

async function copyToClipboard(text: string, i18n: Translator): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showNotification(i18n.t('toast.address_copied'), {
      kind: 'success',
      playerContainer: null,
    });
  } catch {
    showNotification(i18n.t('toast.copy_failed'), {
      kind: 'error',
      playerContainer: null,
    });
  }
}

export function renderDonateSection(i18n: Translator): HTMLElement {
  const t = i18n.t;

  const cloudtipsBtn = h(
    'a',
    {
      class: 'vs-action vs-donate-action',
      href: CLOUDTIPS_URL,
      target: '_blank',
      rel: 'noopener noreferrer',
      title: t('donate.cloudtips.tip'),
    },
    t('donate.cloudtips'),
  );

  const tonBtn = h(
    'button',
    {
      type: 'button',
      class: 'vs-action vs-donate-action',
      title: t('donate.ton.tip'),
    },
    t('donate.ton'),
  );
  tonBtn.addEventListener('click', () => {
    void copyToClipboard(TON_ADDRESS, i18n);
  });

  const usdtBtn = h(
    'button',
    {
      type: 'button',
      class: 'vs-action vs-donate-action',
      title: t('donate.usdt.tip'),
    },
    t('donate.usdt'),
  );
  usdtBtn.addEventListener('click', () => {
    void copyToClipboard(USDT_TRC20_ADDRESS, i18n);
  });

  return h(
    'div',
    { class: 'vs-section vs-donate-section' },
    h('div', { class: 'vs-section-label' }, t('donate.section')),
    h('p', { class: 'vs-help-text' }, t('donate.thanks')),
    h('div', { class: 'vs-action-grid' }, cloudtipsBtn, tonBtn, usdtBtn),
  );
}
