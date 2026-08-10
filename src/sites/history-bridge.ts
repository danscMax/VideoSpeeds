/**
 * Listen for SPA navigations reported by the MAIN-world history hook.
 *
 * `entrypoints/page-world.content.ts` patches `history.pushState`/`replaceState`
 * in page context and postMessages a typed envelope; this is the isolated-world
 * receiver. Every React-router site the extension supports needs exactly this,
 * and it used to live inline in `sites/rutube.ts` — copying it into a second
 * site file would have duplicated the four security checks below, which is the
 * last place a subtle divergence should be allowed to appear.
 *
 * Envelope contract is owned by `sites/bridge-protocol.ts`.
 */

import type { AppContext } from '../app/context';
import { type BridgeMessage, generateSessionId, isBridgeMessage } from './bridge-protocol';

export interface NavigationBridge {
  /** Fired on every page-world history-change event. */
  onNavigation(fn: () => void): void;
  /** Session id for envelope filtering — exposed for tests. */
  sessionId: string;
}

/**
 * @param label site name used in log lines only.
 */
export function createNavigationBridge(ctx: AppContext, label: string): NavigationBridge {
  const subscribers = new Set<() => void>();
  const sessionId = generateSessionId();

  ctx.cleanup.addEventListener(window, 'message', (event) => {
    const ev = event as MessageEvent;
    // Defence in depth (audit 2026-05-09 sec C2/C3):
    //  1. ev.source === window  — rejects messages dispatched from any other
    //     window object, including same-origin iframes (a parent.postMessage
    //     from an ad iframe makes ev.source the iframe's contentWindow).
    //  2. ev.origin === location.origin — additionally rejects cross-origin
    //     iframes that some browsers attribute to the parent window in unusual
    //     edge cases (about:srcdoc inheritance), and blocks any future top
    //     frame embedded in a cross-origin shell.
    //  3. Strict sessionId === 'page' — page-world.content.ts broadcasts with
    //     the literal sentinel 'page'. Any other value indicates an in-page
    //     script forging the envelope; accepting arbitrary ids once allowed a
    //     reattach-spam DoS primitive.
    if (ev.source !== window) return;
    if (ev.origin !== window.location.origin) return;
    if (!isBridgeMessage(ev.data)) return;

    const msg = ev.data as BridgeMessage;
    if (msg.type !== 'history-changed' && msg.type !== 'navigated') return;
    if (msg.sessionId !== 'page') return;

    ctx.logger.debug(`site:${label} nav via bridge`, msg.payload);
    for (const fn of subscribers) {
      try {
        fn();
      } catch (e) {
        ctx.logger.error(`site:${label} nav handler`, e);
      }
    }
  });

  return {
    onNavigation(fn) {
      subscribers.add(fn);
    },
    sessionId,
  };
}
