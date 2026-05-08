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
import {
  BRIDGE_SOURCE,
  type BridgeMessage,
  generateSessionId,
  isBridgeMessage,
} from './bridge-protocol';

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
  const applyHides = (): void => {
    const s = ctx.settingsStore.get();
    setStyleEnabled(HIDE_TITLE_STYLE_ID, HIDE_TITLE_CSS, !!s.hidePlayerTitle);
    setStyleEnabled(HIDE_PREMIUM_STYLE_ID, HIDE_PREMIUM_CSS, !!s.hidePremium);
  };
  applyHides();
  const offSettings = ctx.settingsStore.subscribe(applyHides);
  ctx.cleanup.add(offSettings);
  ctx.cleanup.add(() => {
    document.getElementById(HIDE_TITLE_STYLE_ID)?.remove();
    document.getElementById(HIDE_PREMIUM_STYLE_ID)?.remove();
  });

  ctx.cleanup.addEventListener(window, 'message', (event) => {
    const ev = event as MessageEvent;
    // Same-origin only; we never trust cross-origin messages.
    if (ev.source !== window) return;
    if (!isBridgeMessage(ev.data)) return;

    const msg = ev.data as BridgeMessage;
    // sessionId is informational here (page-world broadcasts to all
    // subscribers); we accept any bridged message regardless because the
    // page-world side only patches once per page load.
    if (msg.type === 'history-changed' || msg.type === 'navigated') {
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

  // Tell the page-world side we're listening (handshake). Any pending
  // batched events from before the listener attached can be replayed.
  try {
    window.postMessage(
      {
        source: BRIDGE_SOURCE,
        sessionId,
        type: 'pong',
      } satisfies BridgeMessage,
      window.location.origin,
    );
  } catch {
    /* swallow */
  }

  // Tell page-world to dispose this session on cleanup so it can release
  // any per-session state it held.
  ctx.cleanup.add(() => {
    try {
      window.postMessage(
        {
          source: BRIDGE_SOURCE,
          sessionId,
          type: 'dispose',
        } satisfies BridgeMessage,
        window.location.origin,
      );
    } catch {
      /* swallow */
    }
  });

  return {
    onNavigation(fn) {
      subscribers.add(fn);
    },
    sessionId,
  };
}
