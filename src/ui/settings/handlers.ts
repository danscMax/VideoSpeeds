/**
 * Settings modal handlers -- the only place outside the controller that
 * mutates settings. Every listener registers via ctx.cleanup so the
 * registry tears them down on dispose (audit C3).
 *
 * The host module gives us the modal root + a `rerender()` callback. We
 * never re-render from inside; we just update settings. The modal's
 * SettingsStore subscription drives the re-render externally.
 *
 * Ported from .user.js:4370-4615 (attachSettingsHandlers).
 */

import type { AppContext } from '../../app/context';
import { captureHotkey, formatHotkey } from '../../speed/hotkeys';
import { defaultSettings, type Hotkey, type SliderPosition } from '../../storage/types';
import {
  exportSettingsToFile,
  openImportPicker,
} from './export-import';
import type { Lang } from '../../i18n/dict';
import type { ActiveTab } from './modal';

export interface SettingsHandlersDeps {
  /** Update which tab is rendered next time. The host re-renders. */
  setActiveTab: (tab: ActiveTab) => void;
  /** Notify host that the modal needs a fresh paint. */
  rerender: () => void;
  /** Discovery cache + diag actions delegate to these. */
  onDiag: (action: 'recheck' | 'copy' | 'purge-cache' | 'full-reset') => void;
  /** Optional toggles for KillSwitch (Wave 1.9). */
  setDiscoveryEnabled?: (on: boolean) => void;
  setHealthCheckEnabled?: (on: boolean) => void;
}

export function attachSettingsHandlers(
  menuRoot: Element,
  ctx: AppContext,
  deps: SettingsHandlersDeps,
): void {
  // ----- Tabs -----
  for (const btn of Array.from(menuRoot.querySelectorAll<HTMLButtonElement>('[data-vs-tab]'))) {
    ctx.cleanup.addEventListener(btn, 'click', () => {
      const tab = btn.dataset.vsTab as ActiveTab | undefined;
      if (tab) {
        deps.setActiveTab(tab);
        deps.rerender();
      }
    });
  }

  // ----- Slider position (segmented control) -----
  for (const btn of Array.from(menuRoot.querySelectorAll<HTMLButtonElement>('[data-vs-pos]'))) {
    ctx.cleanup.addEventListener(btn, 'click', async () => {
      const pos = btn.dataset.vsPos as SliderPosition | undefined;
      if (pos) {
        await ctx.settingsStore.update({ sliderPosition: pos });
        ctx.ui.applyLayout();
        deps.rerender();
      }
    });
  }

  // ----- Language switcher -----
  for (const btn of Array.from(menuRoot.querySelectorAll<HTMLButtonElement>('[data-vs-lang]'))) {
    ctx.cleanup.addEventListener(btn, 'click', async () => {
      const lang = btn.dataset.vsLang as Lang | undefined;
      if (lang === 'en' || lang === 'ru') {
        await ctx.settingsStore.update({ language: lang });
        deps.rerender();
        ctx.ui.showNotification(ctx.i18n.t('toast.lang_switched'), 'info');
      }
    });
  }

  // ----- Behavior toggles -----
  attachToggle(menuRoot, ctx, 'remember-speed', 'rememberSpeed');
  attachToggle(menuRoot, ctx, 'hide-player-title', 'hidePlayerTitle');
  attachToggle(menuRoot, ctx, 'hide-premium', 'hidePremium');

  // ----- Discovery / healthcheck (KillSwitch wiring -- Wave 1.9) -----
  const discoveryCb = menuRoot.querySelector<HTMLInputElement>('input[name="discovery-enabled"]');
  if (discoveryCb && deps.setDiscoveryEnabled) {
    ctx.cleanup.addEventListener(discoveryCb, 'change', () => {
      deps.setDiscoveryEnabled?.(discoveryCb.checked);
      ctx.ui.showNotification(
        ctx.i18n.t(discoveryCb.checked ? 'toast.discovery_on' : 'toast.discovery_off'),
        'info',
      );
    });
  }
  const healthCb = menuRoot.querySelector<HTMLInputElement>('input[name="healthcheck-enabled"]');
  if (healthCb && deps.setHealthCheckEnabled) {
    ctx.cleanup.addEventListener(healthCb, 'change', () => {
      deps.setHealthCheckEnabled?.(healthCb.checked);
      ctx.ui.showNotification(
        ctx.i18n.t(healthCb.checked ? 'toast.healthcheck_on' : 'toast.healthcheck_off'),
        'info',
      );
    });
  }

  // ----- Hotkey capture (focus on input -> next keydown becomes the new combo) -----
  for (const input of Array.from(menuRoot.querySelectorAll<HTMLInputElement>('.vs-hotkey-input'))) {
    const row = input.closest<HTMLElement>('.vs-hotkey-row');
    if (!row) continue;
    const action = row.dataset.hotkeyType as 'speedUp' | 'speedDown' | undefined;
    const slotIndex = Number(row.dataset.slotIndex);
    if (!action || Number.isNaN(slotIndex)) continue;

    ctx.cleanup.addEventListener(input, 'keydown', async (event) => {
      const ev = event as KeyboardEvent;
      if (ev.key === 'Escape' || ev.key === 'Tab') return;
      ev.preventDefault();
      ev.stopPropagation();
      const hk = captureHotkey(ev);
      // Skip pure-modifier presses ("ControlLeft" etc.).
      if (/^(Control|Shift|Alt|Meta)/.test(hk.key)) return;
      const arr = ctx.settingsStore.getKey('hotkeys')[action].slice();
      arr[slotIndex] = hk;
      await ctx.settingsStore.update({
        hotkeys: { ...ctx.settingsStore.getKey('hotkeys'), [action]: arr },
      });
      input.value = formatHotkey(hk);
      deps.rerender();
    });
  }

  // ----- Hotkey add / remove / reset -----
  for (const btn of Array.from(menuRoot.querySelectorAll<HTMLButtonElement>('[data-vs-hotkey-add]'))) {
    ctx.cleanup.addEventListener(btn, 'click', async () => {
      const action = btn.dataset.vsHotkeyAdd as 'speedUp' | 'speedDown' | undefined;
      if (!action) return;
      const live = ctx.settingsStore.getKey('hotkeys');
      const next = {
        ...live,
        [action]: [
          ...live[action],
          // New empty slot; user clicks then presses keys to fill in.
          { ctrl: false, shift: false, alt: false, meta: false, key: 'Insert' } as Hotkey,
        ],
      };
      await ctx.settingsStore.update({ hotkeys: next });
      deps.rerender();
    });
  }

  for (const btn of Array.from(menuRoot.querySelectorAll<HTMLButtonElement>('[data-vs-hotkey-remove]'))) {
    ctx.cleanup.addEventListener(btn, 'click', async () => {
      const row = btn.closest<HTMLElement>('.vs-hotkey-row');
      if (!row) return;
      const action = row.dataset.hotkeyType as 'speedUp' | 'speedDown' | undefined;
      const slotIndex = Number(row.dataset.slotIndex);
      if (!action || Number.isNaN(slotIndex)) return;
      const live = ctx.settingsStore.getKey('hotkeys');
      if (live[action].length <= 1) {
        ctx.ui.showNotification(ctx.i18n.t('toast.shortcut_min'), 'warn');
        return;
      }
      const arr = live[action].slice();
      arr.splice(slotIndex, 1);
      await ctx.settingsStore.update({ hotkeys: { ...live, [action]: arr } });
      deps.rerender();
    });
  }

  for (const btn of Array.from(menuRoot.querySelectorAll<HTMLButtonElement>('[data-vs-hotkey-reset]'))) {
    ctx.cleanup.addEventListener(btn, 'click', async () => {
      const action = btn.dataset.vsHotkeyReset as 'speedUp' | 'speedDown' | undefined;
      if (!action) return;
      const fresh = defaultSettings(ctx.settingsStore.getKey('language')).hotkeys;
      const live = ctx.settingsStore.getKey('hotkeys');
      await ctx.settingsStore.update({
        hotkeys: { ...live, [action]: fresh[action] },
      });
      deps.rerender();
    });
  }

  // ----- Diagnostics actions -----
  for (const btn of Array.from(menuRoot.querySelectorAll<HTMLButtonElement>('[data-vs-diag]'))) {
    ctx.cleanup.addEventListener(btn, 'click', () => {
      const action = btn.dataset.vsDiag;
      if (
        action === 'recheck' ||
        action === 'copy' ||
        action === 'purge-cache' ||
        action === 'full-reset'
      ) {
        deps.onDiag(action);
      }
    });
  }

  // ----- Export / Import -----
  const exportBtn = menuRoot.querySelector<HTMLButtonElement>('[data-vs-action="export"]');
  if (exportBtn) {
    ctx.cleanup.addEventListener(exportBtn, 'click', () => {
      exportSettingsToFile(ctx);
    });
  }
  const importBtn = menuRoot.querySelector<HTMLButtonElement>('[data-vs-action="import"]');
  if (importBtn) {
    ctx.cleanup.addEventListener(importBtn, 'click', () => {
      openImportPicker(ctx, (result) => {
        if (result.ok) {
          ctx.ui.showNotification(ctx.i18n.t('settings.import.success'), 'info');
          deps.rerender();
        } else {
          ctx.ui.showNotification(
            ctx.i18n.t('settings.import.failure', { message: result.message ?? 'unknown' }),
            'error',
          );
        }
      });
    });
  }
}

function attachToggle(
  menuRoot: Element,
  ctx: AppContext,
  inputName: string,
  settingKey: 'rememberSpeed' | 'hidePlayerTitle' | 'hidePremium',
): void {
  const cb = menuRoot.querySelector<HTMLInputElement>(`input[name="${inputName}"]`);
  if (!cb) return;
  ctx.cleanup.addEventListener(cb, 'change', async () => {
    await ctx.settingsStore.update({ [settingKey]: cb.checked } as never);
    if (settingKey === 'hidePlayerTitle') {
      ctx.ui.showNotification(
        ctx.i18n.t(cb.checked ? 'toast.title_hidden' : 'toast.title_shown'),
        'info',
      );
    } else if (settingKey === 'hidePremium') {
      ctx.ui.showNotification(
        ctx.i18n.t(cb.checked ? 'toast.premium_hidden' : 'toast.premium_shown'),
        'info',
      );
    }
  });
}
