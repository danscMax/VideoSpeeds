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
  generateSessionId,
  isBridgeMessage,
  type BridgeMessage,
} from './bridge-protocol';

export interface RutubeSiteHandle {
  /** Fired on every page-world history-change event. */
  onNavigation(fn: () => void): void;
  /** Session id for envelope filtering -- exposed for tests. */
  sessionId: string;
}

export function bootstrapRutubeSite(ctx: AppContext): RutubeSiteHandle {
  const subscribers = new Set<() => void>();
  const sessionId = generateSessionId();

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
        try { fn(); } catch (e) { ctx.logger.error('site:rutube nav handler', e); }
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
    } catch { /* swallow */ }
  });

  return {
    onNavigation(fn) { subscribers.add(fn); },
    sessionId,
  };
}
