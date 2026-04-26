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

export function injectStyles(_site: Site, container: Document = document): void {
  if (container.getElementById(STYLE_ID)) return;
  const style = container.createElement('style');
  style.id = STYLE_ID;
  style.textContent = BASE_STYLES;
  (container.head || container.documentElement).appendChild(style);
}

export function removeStyles(container: Document = document): void {
  container.getElementById(STYLE_ID)?.remove();
}

// Compact base ruleset. Visual polish (per-site accent, theme overrides)
// gets layered in Wave 1.8c. The selectors here line up with the markup
// emitted by buttons.ts / slider.ts / popup.ts / settings/modal.ts.
const BASE_STYLES = `
.speed-buttons-row {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.speed-button {
  padding: 4px 10px;
  border: none;
  border-radius: 6px;
  background: rgba(255,255,255,0.1);
  color: var(--text-color-primary, #fff);
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.15s ease;
}
.speed-button:hover { background: rgba(255,255,255,0.2); }
.speed-button.active {
  background: var(--vs-accent, #ff0000);
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
  width: 120px;
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(
    to right,
    var(--vs-accent, #ff0000) 0%,
    var(--vs-accent, #ff0000) var(--vs-slider-fill, 0%),
    rgba(255,255,255,0.2) var(--vs-slider-fill, 0%),
    rgba(255,255,255,0.2) 100%
  );
  outline: none;
  cursor: pointer;
}
.speed-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--vs-accent, #ff0000);
  border: 2px solid #fff;
  cursor: pointer;
}
.speed-slider-label {
  min-width: 42px;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  color: var(--text-color-primary, #fff);
}

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

/* Settings modal -- simplified Wave 1.8a base; full theming in 1.8c */
.settings-menu {
  position: absolute;
  background: var(--bg-color-primary, rgba(28,28,28,0.95));
  color: var(--text-color-primary, #fff);
  border-radius: 12px;
  padding: 12px;
  min-width: 320px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
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
