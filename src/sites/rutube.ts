/**
 * RuTube site bootstrap.
 *
 * RuTube (React + react-router) doesn't fire DOM events on SPA navigation.
 * The page-world entrypoint patches history.pushState/replaceState and
 * postMessages a typed envelope; we listen here and re-attach the panel.
 *
 * Bridge protocol owned by src/sites/bridge-protocol.ts.
 */

import type { AppContext } from '../app/context';
import { type BridgeMessage, generateSessionId, isBridgeMessage } from './bridge-protocol';

export interface RutubeSiteHandle {
  /** Fired on every page-world history-change event. */
  onNavigation(fn: () => void): void;
  /** Session id for envelope filtering -- exposed for tests. */
  sessionId: string;
}

const HIDE_TITLE_STYLE_ID = 'vs-rutube-hide-title-style';
const HIDE_PREMIUM_STYLE_ID = 'vs-rutube-hide-premium-style';

const HIDE_TITLE_CSS = `
[class*="title-module__wrapper"] {
  display: none !important;
  opacity: 0 !important;
  visibility: hidden !important;
  height: 0 !important;
  pointer-events: none !important;
}
:fullscreen [class*="title-module__wrapper"],
:-webkit-full-screen [class*="title-module__wrapper"],
:-moz-full-screen [class*="title-module__wrapper"] {
  display: none !important;
}
`;

const HIDE_PREMIUM_CSS = `
[class*="premium-subscription"],
[class*="subscription-entrypoint"],
.premium-subscription-entrypoint-module__desktop,
.premium-subscription-entrypoint-module__premium-entrypoint {
  display: none !important;
  visibility: hidden !important;
  height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  pointer-events: none !important;
}
`;

/**
 * Inject or remove a style element keyed by id. Idempotent. Ports the
 * applyRutubeTitleHide / applyRutubePremiumHide pattern from
 * .user.js:1537-1605.
 */
function setStyleEnabled(id: string, css: string, enabled: boolean): void {
  const existing = document.getElementById(id);
  if (enabled) {
    if (existing) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  } else if (existing) {
    existing.remove();
  }
}

export function bootstrapRutubeSite(ctx: AppContext): RutubeSiteHandle {
  const subscribers = new Set<() => void>();
  const sessionId = generateSessionId();

  // Initial application of hide-title / hide-Premium toggles + reactive
  // re-application on settings change. Mirrors .user.js:2199-2204 (bootstrap)
  // and the change handlers wired into the modal toggles in the original.
  //
  // Audit 2026-05-11 W5.6 (PERF-009): track last applied values so a
  // settings.update() unrelated to these two toggles (language switch,
  // slider position, hotkey edit, etc.) doesn't re-run the
  // getElementById + style toggle work. settings.update is N-times-
  // per-session common; hide-toggles are rare clicks.
  let lastHideTitle = ctx.settingsStore.getKey('hidePlayerTitle') === true;
  let lastHidePremium = ctx.settingsStore.getKey('hidePremium') === true;
  const applyHides = (): void => {
    const s = ctx.settingsStore.get();
    const t = !!s.hidePlayerTitle;
    const p = !!s.hidePremium;
    if (t !== lastHideTitle) {
      setStyleEnabled(HIDE_TITLE_STYLE_ID, HIDE_TITLE_CSS, t);
      lastHideTitle = t;
    }
    if (p !== lastHidePremium) {
      setStyleEnabled(HIDE_PREMIUM_STYLE_ID, HIDE_PREMIUM_CSS, p);
      lastHidePremium = p;
    }
  };
  // Force initial application bypassing the equality guard so the
  // first paint reflects persisted user choice.
  setStyleEnabled(HIDE_TITLE_STYLE_ID, HIDE_TITLE_CSS, lastHideTitle);
  setStyleEnabled(HIDE_PREMIUM_STYLE_ID, HIDE_PREMIUM_CSS, lastHidePremium);
  const offSettings = ctx.settingsStore.subscribe(applyHides);
  ctx.cleanup.add(offSettings);
  ctx.cleanup.add(() => {
    document.getElementById(HIDE_TITLE_STYLE_ID)?.remove();
    document.getElementById(HIDE_PREMIUM_STYLE_ID)?.remove();
  });

  ctx.cleanup.addEventListener(window, 'message', (event) => {
    const ev = event as MessageEvent;
    // Defence in depth (audit 2026-05-09 sec C2/C3):
    //  1. ev.source === window  — this rejects messages dispatched from any
    //     other window object, including same-origin iframes (parent.postMessage
    //     from an ad iframe makes ev.source === iframe.contentWindow, not us).
    //  2. ev.origin === location.origin — additionally rejects cross-origin
    //     iframes that some browsers attribute to the parent window in
    //     unusual edge cases (e.g. about:srcdoc with inheritance), and
    //     blocks any future top-frame embedded in a cross-origin shell.
    //  3. Strict sessionId === 'page' — page-world.content.ts broadcasts
    //     navigation events with the literal sentinel 'page'. Any other
    //     value indicates a malicious in-page script forging the envelope
    //     (formerly we accepted arbitrary sessionId values, allowing a
    //     reattach-spam DoS primitive).
    if (ev.source !== window) return;
    if (ev.origin !== window.location.origin) return;
    if (!isBridgeMessage(ev.data)) return;

    const msg = ev.data as BridgeMessage;
    if (msg.type === 'history-changed' || msg.type === 'navigated') {
      if (msg.sessionId !== 'page') return;
      ctx.logger.debug('site:rutube nav via bridge', msg.payload);
      for (const fn of subscribers) {
        try {
          fn();
        } catch (e) {
          ctx.logger.error('site:rutube nav handler', e);
        }
      }
    }
  });

  // Audit 2026-05-11 W2.2 (REL-005 + PLAT-001 + SEC-004): removed
  // pong/dispose postMessage broadcasts. The page-world side never
  // installed a receiver — these envelopes vanished into the void
  // while exposing the per-bootstrap sessionId to any in-page
  // listener (passive fingerprint surface on RuTube). The "replay
  // pending events" comment was aspirational; no buffer existed in
  // page-world.content.ts. Bridge is now strictly one-way
  // (page → isolated). See bridge-protocol.ts BridgeMessageType.

  return {
    onNavigation(fn) {
      subscribers.add(fn);
    },
    sessionId,
  };
}
