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
// CSS keys off `data-vs-theme` so labels + slider track adapt to the
// surrounding page colour (the panel itself is transparent).
//
// Per-site accent: --vs-accent overridden via the `[data-vs-site]`
// attribute the panel itself carries (see panel.ts), so YouTube gets red
// and RuTube its blue.
const BASE_STYLES = `
/* Token sets per theme. The PANEL itself is transparent (matches the
   original userscript layout: speed buttons sit on the host page
   background, attached just below the player -- user feedback
   2026-04-26 confirmed this). Buttons + gear carry their own dark
   pills; slider track + label adapt to the surrounding page colour. */
:root,
html[data-vs-theme="dark"] {
  --vs-bg-button: rgba(75, 75, 75, 0.85);
  --vs-bg-button-hover: rgba(100, 100, 100, 0.95);
  --vs-bg-track: rgba(255, 255, 255, 0.22);
  --vs-text-primary: rgba(255, 255, 255, 0.95);
  --vs-text-secondary: rgba(255, 255, 255, 0.65);
  --vs-border: rgba(255, 255, 255, 0.08);
  --vs-accent: #ff0000;
}
html[data-vs-theme="light"] {
  --vs-bg-button: rgba(35, 35, 35, 0.90);
  --vs-bg-button-hover: rgba(15, 15, 15, 0.97);
  --vs-bg-track: rgba(0, 0, 0, 0.18);
  --vs-text-primary: rgba(15, 15, 15, 0.92);
  --vs-text-secondary: rgba(15, 15, 15, 0.55);
  --vs-border: rgba(0, 0, 0, 0.08);
  --vs-accent: #ff0000;
}

/* Per-site accent + accent-dark for the active-button gradient. */
.vs-panel[data-vs-site="rutube"]  { --vs-accent: #00A1E7; --vs-accent-dark: #0086c4; --vs-accent-rgb: 0,161,231; }
.vs-panel[data-vs-site="youtube"] { --vs-accent: #ff0000; --vs-accent-dark: #cc0000; --vs-accent-rgb: 255,0,0; }

/* The panel: TRANSPARENT flex row attached just below the player. No
   capsule background -- buttons and the gear handle their own visual
   weight so the row blends with whatever surface YouTube/RuTube paints
   (matches the original userscript layout). */
@keyframes vs-fade-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.vs-panel {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  margin: 8px 0;
  width: 100%;
  box-sizing: border-box;
  background: transparent;
  border: none;
  font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: var(--vs-text-primary);
  /* No z-index here on purpose: it would create a stacking context that
     traps the settings modal (child) under any host-page element with a
     higher z-index in the document context (YouTube comments header,
     RuTube sidebar). The gear-wrapper still has position:relative so the
     modal can anchor to it. */
  position: static;
  animation: vs-fade-in 0.3s ease;
}

/* Speed-button row: pill buttons. min-width keeps every label centred
   even when the text varies (1x vs 1.25x); height fixed so the row is
   visually stable. Ported from .user.js:.speed-button. */
.speed-buttons-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  flex-shrink: 0;
}
.speed-button {
  position: relative;
  min-width: 56px;
  height: 28px;
  padding: 0 14px;
  border: none;
  outline: none;
  border-radius: 14px;
  background: var(--vs-bg-button);
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.05px;
  font-variant-numeric: tabular-nums;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease, color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  user-select: none;
  overflow: hidden;
}
.speed-button:hover {
  background: var(--vs-bg-button-hover);
  color: #fff;
  transform: translateY(-1px);
}
.speed-button.active {
  background: linear-gradient(135deg, var(--vs-accent) 0%, var(--vs-accent-dark) 100%);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 10px rgba(var(--vs-accent-rgb), 0.35);
}
.speed-button.active:hover {
  background: linear-gradient(135deg, var(--vs-accent-dark) 0%, var(--vs-accent) 100%);
  box-shadow: 0 3px 14px rgba(var(--vs-accent-rgb), 0.5);
}

/* Click ripple -- radial-gradient that grows from centre. */
.speed-button::before {
  position: absolute;
  content: "";
  top: 0; left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%);
  transform: scale(0);
  opacity: 0;
  transition: transform 0.4s ease;
  pointer-events: none;
}
.speed-button:active::before {
  transform: scale(2);
  opacity: 1;
  transition: 0s;
}

/* Slider sits between the buttons and the gear. The original userscript
   used a 300px container; we let it stretch on the modern wide YouTube
   layout (flex: 1) but keep a min-width so it doesn't collapse. Thumb
   is white (matches video-player ergonomics) with the accent fill on
   the track. */
.speed-slider-container {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 4px;
  flex: 1 1 220px;
  min-width: 160px;
  height: 32px;
  position: relative;
}
.speed-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  flex: 1 1 auto;
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--vs-accent) 0%,
    var(--vs-accent) var(--vs-slider-fill, 0%),
    var(--vs-bg-track) var(--vs-slider-fill, 0%),
    var(--vs-bg-track) 100%
  );
  outline: none;
  cursor: pointer;
  margin: 0;
  transition: height 0.15s ease;
}
.speed-slider-container:hover .speed-slider { height: 6px; }
.speed-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  border: none;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0,0,0,0.5);
  transition: transform 0.15s ease;
}
.speed-slider-container:hover .speed-slider::-webkit-slider-thumb {
  transform: scale(1.4);
}
.speed-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  border: none;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0,0,0,0.5);
}
.speed-slider-container:hover .speed-slider::-moz-range-thumb {
  transform: scale(1.4);
}
.speed-slider-label {
  min-width: 50px;
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  font-weight: 600;
  color: var(--vs-text-primary);
  text-align: right;
  flex-shrink: 0;
}

/* Gear -- circular icon button. Matches the original userscript
   .settings-button (28x28 circle, 16px SVG, rotates 60deg on hover). */
.vs-gear-wrapper {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}
.vs-gear-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: var(--vs-bg-button);
  color: #fff;
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease;
}
.vs-gear-button svg {
  width: 16px;
  height: 16px;
  transition: transform 0.3s ease;
}
.vs-gear-button:hover {
  background: var(--vs-bg-button-hover);
  color: #fff;
}
.vs-gear-button:hover svg {
  transform: rotate(60deg);
}

/* Health-warning dot: pulsing red marker on the gear when the
   diagnostic checker reports an unhealthy state. Toggle via the
   has-warning class (Wave 1.9 wires this up). */
.vs-gear-button.has-warning::after {
  content: '';
  position: absolute;
  top: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f44336;
  box-shadow: 0 0 4px rgba(244, 67, 54, 0.7);
  animation: vs-warning-pulse 2s infinite;
  pointer-events: none;
}
@keyframes vs-warning-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.45; }
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

/* Settings modal -- floating popover with its own dark surface, opaque
   so it stays readable on any host theme without the cost of a real-time
   backdrop-filter (cheap solid fill paints in one tile). Internal text +
   tokens are scoped to this rule so descendants always render dark. */
.settings-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: rgb(28, 28, 30);
  color: rgba(255, 255, 255, 0.95);
  --vs-text-primary: rgba(255, 255, 255, 0.95);
  --vs-text-secondary: rgba(255, 255, 255, 0.65);
  --vs-border: rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px;
  min-width: 320px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px rgba(0,0,0,0.45);
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
