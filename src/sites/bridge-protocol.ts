/**
 * Typed bridge between the page-world script and the isolated content
 * script (audit H3).
 *
 * The page-world entrypoint patches history.pushState/replaceState in the
 * page's JS context. We can't share function references across worlds, so
 * the bridge uses window.postMessage with a typed envelope:
 *
 *   { source: 'video-speeds', sessionId, type, payload? }
 *
 * The sessionId is generated per content-script load; the page-world side
 * keeps a Set of (sessionId, handler) so it can dispose individual
 * subscribers when the isolated side calls `dispose`. Stale subscribers
 * from a previous content-script load are dropped automatically.
 */

const SOURCE = 'video-speeds';

export type BridgeMessageType =
  | 'history-changed'
  | 'navigated'
  | 'dispose'
  | 'pong';

export interface BridgeMessage<P = unknown> {
  source: typeof SOURCE;
  sessionId: string;
  type: BridgeMessageType;
  payload?: P;
}

export const BRIDGE_SOURCE = SOURCE;

export function isBridgeMessage(value: unknown): value is BridgeMessage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.source === SOURCE && typeof v.sessionId === 'string' && typeof v.type === 'string';
}

/**
 * RFC4122 v4 generator using crypto.getRandomValues; falls back to Math.random
 * when in environments without web crypto (extremely rare, but defensive).
 */
export function generateSessionId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch { /* swallow */ }
  // Fallback -- not cryptographically strong but unique per content-script load.
  return 'vs-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}
