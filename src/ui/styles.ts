/**
 * CSS injection for the in-player UI.
 *
 * Wave 1.8a ships the rules needed for the modules created in this wave
 * (notifications, popup, slider, buttons, settings modal). The full set
 * with per-site theming and player-overlay positioning lives in
 * src/ui/styles-full.css equivalent and gets injected by Wave 1.8c
 * (insertion + layout).
 *
 * Idempotent on the <style> tag id: safe to call multiple times during
 * SPA re-attach.
 */

import type { Site } from '../app/ports';

const STYLE_ID = 'vs-styles';

export function injectStyles(site: Site, container: Document = document): void {
  detectAndApplyTheme(site, container);
  if (container.getElementById(STYLE_ID)) return;
  const style = container.createElement('style');
  style.id = STYLE_ID;
  style.textContent = BASE_STYLES;
  (container.head || container.documentElement).appendChild(style);
}

export function removeStyles(container: Document = document): void {
  container.getElementById(STYLE_ID)?.remove();
  delete container.documentElement.dataset.vsTheme;
}

/**
 * Decide the theme based on the site + the host's own theme attributes,
 * then write `data-vs-theme="dark"|"light"` onto `<html>` so the CSS
 * variable bundle above takes effect.
 *
 *   RuTube  -- always dark (the site has no light mode)
 *   YouTube -- mirror the [dark] attribute YouTube sets when the user
 *              picks dark; default light otherwise
 */
export function detectAndApplyTheme(site: Site, container: Document = document): void {
  const root = container.documentElement;
  let theme: 'dark' | 'light' = 'dark';
  if (site === 'rutube') {
    theme = 'dark';
  } else if (site === 'youtube') {
    theme =
      root.hasAttribute('dark') ||
      root.getAttribute('data-theme') === 'dark'
        ? 'dark'
        : 'light';
  }
  root.dataset.vsTheme = theme;
}

// Compact base ruleset with explicit theme handling.
//
// Theme is decided by detectAndApplyTheme() (called from bootstrap) which
// writes `data-vs-theme="dark"|"light"` onto `<html>`. The decision rule:
//   - RuTube: always dark (RuTube has no light mode)
//   - YouTube: read its own `[dark]` attribute, default light otherwise
//   - Other future sites: sample player's computed background color
// CSS keys ONLY off our `data-vs-theme` attribute -- this avoids the brittle
// "site might or might not set [dark]" guesses we had earlier.
//
// Per-site accent: --vs-accent overridden via the `[data-vs-site]`
// attribute the panel itself carries (see panel.ts), so YouTube gets red
// (its own brand) and RuTube gets its blue.
const BASE_STYLES = `
/* Default = dark theme. Set both at :root and on html[data-vs-theme="dark"]
   so the panel still renders sanely if detectAndApplyTheme hasn't run yet. */
:root,
html[data-vs-theme="dark"] {
  --vs-bg-panel: rgba(28, 28, 28, 0.95);
  --vs-bg-button: rgba(255, 255, 255, 0.12);
  --vs-bg-button-hover: rgba(255, 255, 255, 0.22);
  --vs-bg-track: rgba(255, 255, 255, 0.2);
  --vs-text-primary: rgba(255, 255, 255, 0.92);
  --vs-text-secondary: rgba(255, 255, 255, 0.6);
  --vs-border: rgba(255, 255, 255, 0.1);
  --vs-accent: #ff0000;
}
html[data-vs-theme="light"] {
  --vs-bg-panel: rgba(248, 248, 248, 0.96);
  --vs-bg-button: rgba(0, 0, 0, 0.06);
  --vs-bg-button-hover: rgba(0, 0, 0, 0.12);
  --vs-bg-track: rgba(0, 0, 0, 0.1);
  --vs-text-primary: rgba(0, 0, 0, 0.88);
  --vs-text-secondary: rgba(0, 0, 0, 0.55);
  --vs-border: rgba(0, 0, 0, 0.08);
}

/* Per-site accent. The panel root carries data-vs-site so each site gets
   its own brand colour for the active button + slider fill. */
.vs-panel[data-vs-site="rutube"] { --vs-accent: #00A1E7; }
.vs-panel[data-vs-site="youtube"] { --vs-accent: #ff0000; }

.vs-panel {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  margin: 8px 0;
  background: var(--vs-bg-panel);
  border-radius: 8px;
  border: 1px solid var(--vs-border);
  font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif;
  color: var(--vs-text-primary);
  /* Sticks above YouTube's lazy-loaded content blocks but below modals. */
  position: relative;
  z-index: 100;
}
.speed-buttons-row {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.speed-button {
  padding: 5px 10px;
  border: none;
  border-radius: 6px;
  background: var(--vs-bg-button);
  color: var(--vs-text-primary);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  transition: background-color 0.15s ease;
}
.speed-button:hover { background: var(--vs-bg-button-hover); }
.speed-button.active {
  background: var(--vs-accent);
  color: #fff;
}

.speed-slider-container {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px;
}
.speed-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 140px;
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(
    to right,
    var(--vs-accent) 0%,
    var(--vs-accent) var(--vs-slider-fill, 0%),
    var(--vs-bg-track) var(--vs-slider-fill, 0%),
    var(--vs-bg-track) 100%
  );
  outline: none;
  cursor: pointer;
}
.speed-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--vs-accent);
  border: 2px solid var(--vs-bg-panel);
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
.speed-slider-label {
  min-width: 46px;
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  font-weight: 500;
  color: var(--vs-text-primary);
}

/* Gear button -- compact icon button next to the slider. */
.vs-gear-wrapper { position: relative; display: inline-flex; }
.vs-gear-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: var(--vs-bg-button);
  color: var(--vs-text-primary);
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.vs-gear-button:hover { background: var(--vs-bg-button-hover); }

#speed-popup.speed-popup {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0,0,0,0.8);
  color: #fff;
  font-size: 28px;
  font-weight: 600;
  padding: 10px 20px;
  border-radius: 12px;
  opacity: 0;
  transition: opacity 0.18s ease;
  pointer-events: none;
  z-index: 100002;
  font-variant-numeric: tabular-nums;
}
#speed-popup.speed-popup.show { opacity: 1; }

/* Settings modal */
.settings-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: var(--vs-bg-panel);
  color: var(--vs-text-primary);
  border-radius: 12px;
  padding: 12px;
  min-width: 320px;
  border: 1px solid var(--vs-border);
  box-shadow: 0 8px 32px rgba(0,0,0,0.35);
  z-index: 100003;
}
.vs-menu-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
.vs-menu-title  { display:flex; align-items:center; gap:6px; font-weight:600; }
.vs-menu-version { font-size:11px; opacity:0.6; }
.vs-tabs        { display:flex; gap:4px; border-bottom:1px solid rgba(255,255,255,0.1); margin-bottom:10px; }
.vs-tab         { padding:6px 10px; background:transparent; border:none; color:inherit; cursor:pointer; opacity:0.6; }
.vs-tab[aria-selected="true"] { opacity:1; border-bottom:2px solid var(--vs-accent,#ff0000); }
.vs-tab-panel[aria-hidden="true"] { display:none; }
.vs-section { margin-bottom:12px; }
.vs-section-label { font-size:11px; opacity:0.7; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.05em; }
.vs-segmented { display:flex; gap:2px; background:rgba(255,255,255,0.05); border-radius:6px; padding:2px; }
.vs-segmented-option {
  flex:1; padding:6px 10px; background:transparent; border:none; color:inherit;
  cursor:pointer; border-radius:4px; display:flex; align-items:center; justify-content:center; gap:4px;
  font-size:12px;
}
.vs-segmented-option[aria-pressed="true"] { background:rgba(255,255,255,0.15); }
.vs-row { display:flex; justify-content:space-between; align-items:center; padding:6px 0; cursor:pointer; }
.vs-row-label { display:flex; align-items:center; gap:4px; font-size:13px; }
.vs-row-hint  { display:inline-flex; align-items:center; justify-content:center;
                width:14px; height:14px; border-radius:50%; background:rgba(255,255,255,0.15);
                font-size:9px; opacity:0.8; cursor:help; }
.vs-toggle    { position:relative; display:inline-block; width:32px; height:18px; }
.vs-toggle input { opacity:0; width:0; height:0; }
.vs-toggle-track { position:absolute; inset:0; background:rgba(255,255,255,0.2); border-radius:10px; transition:background 0.15s; }
.vs-toggle-thumb { position:absolute; top:2px; left:2px; width:14px; height:14px;
                   background:#fff; border-radius:50%; transition:left 0.15s; }
.vs-toggle input:checked + .vs-toggle-track { background:var(--vs-accent,#ff0000); }
.vs-toggle input:checked ~ .vs-toggle-thumb { left:16px; }

.vs-help-text { font-size:12px; opacity:0.7; margin:8px 0; }
.vs-hotkey-block { padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05); }
.vs-hotkey-block-title { font-size:13px; font-weight:500; margin-bottom:6px; }
.vs-hotkey-list { display:flex; flex-direction:column; gap:4px; }
.vs-hotkey-row  { display:flex; gap:4px; }
.vs-hotkey-input {
  flex:1; padding:4px 8px; border-radius:4px; border:1px solid rgba(255,255,255,0.1);
  background:rgba(255,255,255,0.05); color:inherit; font-size:12px; cursor:pointer;
}
.vs-hotkey-input:focus { border-color: var(--vs-accent,#ff0000); outline:none; }
.vs-icon-button {
  background:transparent; border:none; color:inherit; cursor:pointer; padding:4px;
  border-radius:4px; display:inline-flex; align-items:center; justify-content:center;
}
.vs-icon-button.danger { color:#f44336; }
.vs-add-button {
  margin-top:6px; padding:4px 8px; background:transparent;
  border:1px dashed rgba(255,255,255,0.2); border-radius:4px;
  color:inherit; cursor:pointer; font-size:12px;
  display:inline-flex; align-items:center; gap:4px;
}
.vs-reset-link {
  display:inline-block; margin-top:4px; background:transparent; border:none;
  color:inherit; opacity:0.6; cursor:pointer; font-size:11px; text-decoration:underline;
}

.vs-status { display:flex; gap:8px; padding:10px; border-radius:6px;
             background:rgba(255,255,255,0.05); margin-bottom:8px; }
.vs-status-dot { width:8px; height:8px; border-radius:50%; background:#999; margin-top:4px; flex-shrink:0; }
.vs-status[data-state="ok"]      .vs-status-dot { background:#4CAF50; }
.vs-status[data-state="warn"]    .vs-status-dot { background:#ff9800; }
.vs-status[data-state="waiting"] .vs-status-dot { background:#2196F3; }
.vs-status-headline { font-size:13px; font-weight:500; margin-bottom:2px; }
.vs-status-detail   { font-size:11px; opacity:0.7; }
.vs-action-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:8px; }
.vs-action {
  padding:6px 10px; background:rgba(255,255,255,0.08); border:none; border-radius:6px;
  color:inherit; cursor:pointer; font-size:12px;
  display:inline-flex; align-items:center; justify-content:center; gap:4px;
}
.vs-action.danger { color:#f44336; }
.vs-privacy-hint {
  display:flex; align-items:center; gap:4px; font-size:10px; opacity:0.5;
  padding-top:6px; border-top:1px solid rgba(255,255,255,0.05);
}
`;
