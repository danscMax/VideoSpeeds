/**
 * Settings modal template -- pure function from (settings, i18n, options)
 * to an HTML string. The outer element is created by the caller; this
 * module only emits inner markup that gets handed to safeSetInnerHTML.
 *
 * Three tabs: General, Shortcuts, Diagnostics. The active tab is preserved
 * across re-renders by passing `activeTab` from the parent state.
 *
 * Ported from .user.js:4134-4311.
 */

import { vsIcon } from '../icons';
import { escHtml } from '../../i18n/translator';
import { generateHotkeyBlock } from './hotkey-block';
import type { Settings } from '../../storage/types';
import type { Site, Translator } from '../../app/ports';

export type ActiveTab = 'general' | 'hotkeys' | 'diag';

export interface ModalRenderOptions {
  settings: Settings;
  site: Site;
  i18n: Translator;
  activeTab: ActiveTab;
  scriptVersion: string;
  /** KillSwitch flags from Wave 1.9. Defaulting to true keeps render
   *  meaningful before the diagnostics layer wires in. */
  discoveryEnabled?: boolean;
  healthCheckEnabled?: boolean;
}

export function renderSettingsMenu(opts: ModalRenderOptions): string {
  const { settings, site, i18n, activeTab, scriptVersion } = opts;
  const t = i18n.t;
  const e = escHtml;

  const isYouTube = site === 'youtube';
  const isRutube  = site === 'rutube';

  const sel = (v: string): string => (v === settings.sliderPosition ? 'true' : 'false');
  const tabHidden = (panel: ActiveTab): string => (panel === activeTab ? 'false' : 'true');
  const tabSelected = (tab: ActiveTab): string => (tab === activeTab ? 'true' : 'false');

  const discoveryEnabled = opts.discoveryEnabled ?? true;
  const healthCheckEnabled = opts.healthCheckEnabled ?? true;

  return `
    <div class="vs-menu-header">
      <div class="vs-menu-title">
        ${vsIcon('settings', 14)} ${e(t('menu.title'))}
      </div>
      <span class="vs-menu-version" title="${e(t('menu.version_tip'))}">v${e(scriptVersion)}</span>
    </div>

    <div class="vs-tabs" role="tablist">
      <button class="vs-tab" role="tab" data-vs-tab="general" aria-selected="${tabSelected('general')}"
              title="${e(t('tabs.general.tip'))}">
        ${vsIcon('sliders', 13)} ${e(t('tabs.general'))}
      </button>
      <button class="vs-tab" role="tab" data-vs-tab="hotkeys" aria-selected="${tabSelected('hotkeys')}"
              title="${e(t('tabs.shortcuts.tip'))}">
        ${vsIcon('keyboard', 13)} ${e(t('tabs.shortcuts'))}
      </button>
      <button class="vs-tab" role="tab" data-vs-tab="diag" aria-selected="${tabSelected('diag')}"
              title="${e(t('tabs.diag.tip'))}">
        ${vsIcon('wrench', 13)} ${e(t('tabs.diag'))}
      </button>
    </div>

    <div class="vs-tab-panel" data-vs-panel="general" aria-hidden="${tabHidden('general')}">
      <div class="vs-section">
        <div class="vs-section-label">${e(t('general.slider_pos'))}</div>
        <div class="vs-segmented" role="radiogroup" aria-label="${e(t('general.slider_pos'))}">
          <button class="vs-segmented-option" role="radio" data-vs-pos="right" aria-pressed="${sel('right')}"
                  title="${e(t('general.pos.right.tip'))}">
            ${vsIcon('panel-right', 13)} ${e(t('general.pos.right'))}
          </button>
          <button class="vs-segmented-option" role="radio" data-vs-pos="bottom" aria-pressed="${sel('bottom')}"
                  title="${e(t('general.pos.bottom.tip'))}">
            ${vsIcon('panel-bottom', 13)} ${e(t('general.pos.bottom'))}
          </button>
          ${isYouTube
            ? `<button class="vs-segmented-option" role="radio" data-vs-pos="video" aria-pressed="${sel('video')}"
                       title="${e(t('general.pos.video.tip'))}">
                 ${vsIcon('tv', 13)} ${e(t('general.pos.video'))}
               </button>`
            : ''}
        </div>
      </div>

      <div class="vs-section">
        <div class="vs-section-label">${e(t('lang.section_label'))}</div>
        <div class="vs-segmented" role="radiogroup" aria-label="${e(t('lang.section_label'))}">
          <button class="vs-segmented-option" role="radio" data-vs-lang="en"
                  aria-pressed="${settings.language === 'en' ? 'true' : 'false'}"
                  title="${e(t('lang.tooltip_en'))}">
            ${vsIcon('globe', 13)} English
          </button>
          <button class="vs-segmented-option" role="radio" data-vs-lang="ru"
                  aria-pressed="${settings.language === 'ru' ? 'true' : 'false'}"
                  title="${e(t('lang.tooltip_ru'))}">
            ${vsIcon('globe', 13)} Русский
          </button>
        </div>
      </div>

      <div class="vs-section">
        <div class="vs-section-label">${e(t('behavior.section'))}</div>
        <label class="vs-row" title="${e(t('behavior.remember.tip'))}">
          <span class="vs-row-label">${e(t('behavior.remember'))}</span>
          <span class="vs-toggle">
            <input type="checkbox" name="remember-speed" ${settings.rememberSpeed ? 'checked' : ''}>
            <span class="vs-toggle-track"></span>
            <span class="vs-toggle-thumb"></span>
          </span>
        </label>
        ${isRutube
          ? `<label class="vs-row" title="${e(t('behavior.hide_title.tip'))}">
              <span class="vs-row-label">${e(t('behavior.hide_title'))}</span>
              <span class="vs-toggle">
                <input type="checkbox" name="hide-player-title" ${settings.hidePlayerTitle ? 'checked' : ''}>
                <span class="vs-toggle-track"></span>
                <span class="vs-toggle-thumb"></span>
              </span>
            </label>
            <label class="vs-row" title="${e(t('behavior.hide_premium.tip'))}">
              <span class="vs-row-label">${e(t('behavior.hide_premium'))}</span>
              <span class="vs-toggle">
                <input type="checkbox" name="hide-premium" ${settings.hidePremium ? 'checked' : ''}>
                <span class="vs-toggle-track"></span>
                <span class="vs-toggle-thumb"></span>
              </span>
            </label>`
          : ''}
      </div>

      <div class="vs-section">
        <div class="vs-section-label">${e(t('advanced.section'))}</div>
        <label class="vs-row">
          <span class="vs-row-label">
            ${e(t('advanced.discovery'))}
            <span class="vs-row-hint" title="${e(t('advanced.discovery.hint'))}">?</span>
          </span>
          <span class="vs-toggle">
            <input type="checkbox" name="discovery-enabled" ${discoveryEnabled ? 'checked' : ''}>
            <span class="vs-toggle-track"></span>
            <span class="vs-toggle-thumb"></span>
          </span>
        </label>
        <label class="vs-row">
          <span class="vs-row-label">
            ${e(t('advanced.healthcheck'))}
            <span class="vs-row-hint" title="${e(t('advanced.healthcheck.hint'))}">?</span>
          </span>
          <span class="vs-toggle">
            <input type="checkbox" name="healthcheck-enabled" ${healthCheckEnabled ? 'checked' : ''}>
            <span class="vs-toggle-track"></span>
            <span class="vs-toggle-thumb"></span>
          </span>
        </label>
      </div>
    </div>

    <div class="vs-tab-panel" data-vs-panel="hotkeys" aria-hidden="${tabHidden('hotkeys')}">
      <p class="vs-help-text">${e(t('hotkeys.help'))}</p>
      ${generateHotkeyBlock('speedUp',   settings.hotkeys.speedUp,   t('hotkeys.speedup_label'),   'chevron-up',   i18n)}
      ${generateHotkeyBlock('speedDown', settings.hotkeys.speedDown, t('hotkeys.speeddown_label'), 'chevron-down', i18n)}
    </div>

    <div class="vs-tab-panel" data-vs-panel="diag" aria-hidden="${tabHidden('diag')}">
      <div class="vs-status" data-state="idle" data-vs-diag-status>
        <div class="vs-status-dot"></div>
        <div class="vs-status-body">
          <div class="vs-status-headline" data-vs-diag-headline>${e(t('diag.status.not_checked'))}</div>
          <div class="vs-status-detail"   data-vs-diag-detail>${e(t('diag.status.click_to_check'))}</div>
        </div>
      </div>

      <div class="vs-action-grid">
        <button class="vs-action" data-vs-diag="recheck"     title="${e(t('diag.btn.recheck.tip'))}">
          ${vsIcon('refresh-cw', 14)} ${e(t('diag.btn.recheck'))}
        </button>
        <button class="vs-action" data-vs-diag="copy"        title="${e(t('diag.btn.copy.tip'))}">
          ${vsIcon('clipboard', 14)} ${e(t('diag.btn.copy'))}
        </button>
        <button class="vs-action danger" data-vs-diag="purge-cache" title="${e(t('diag.btn.purge.tip'))}">
          ${vsIcon('trash', 14)} ${e(t('diag.btn.purge'))}
        </button>
        <button class="vs-action danger" data-vs-diag="full-reset"  title="${e(t('diag.btn.full_reset.tip'))}">
          ${vsIcon('alert', 14)} ${e(t('diag.btn.full_reset'))}
        </button>
      </div>

      <!-- Wave 1.8b adds Export/Import buttons here (TM migration workaround,
           audit C5). Markup TODO. -->

      <div class="vs-privacy-hint">
        ${vsIcon('lock', 11)}
        <span>${e(t('diag.privacy'))}</span>
      </div>
    </div>
  `;
}
