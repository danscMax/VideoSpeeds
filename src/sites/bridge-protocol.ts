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

// Audit 2026-05-11 W5.2 (PLAT-003): versioned envelope source.
// The page-world history-hook is installed permanently on first page
// load — its bound `original`/`broadcast` closures stick around even
// across extension HMR / future protocol bumps. Bumping the version
// suffix here makes the isolated side reject envelopes from a
// previous protocol generation (those keep emitting `video-speeds`
// with no version suffix from the old page-world closure), so a
// schema change like adding a new payload field can't be silently
// mis-parsed. Bump on every breaking envelope change.
const SOURCE = 'video-speeds@1';

// Audit 2026-05-11 W2.2: narrowed to the two types the isolated world
// actually receives. The previous 'dispose' | 'pong' write-only entries
// were removed (rutube.ts no longer broadcasts them — they leaked the
// sessionId to in-page listeners with no functional benefit).
export type BridgeMessageType = 'history-changed' | 'navigated';

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
  // Strict match — `video-speeds@N` only. Old `video-speeds` from a
  // pre-W5.2 page-world closure is rejected, so a protocol bump is
  // safe even when long-lived RuTube tabs survive an extension reload.
  return v.source === SOURCE && typeof v.sessionId === 'string' && typeof v.type === 'string';
}

/**
 * RFC4122 v4 generator. Tries crypto.randomUUID() first (Chrome 92+, Firefox 95+),
 * then crypto.getRandomValues() as a strong fallback. The Math.random() leg
 * is a last-resort defensive branch — the security model uses sessionId
 * primarily as an envelope-routing key, with origin + literal-'page' guards
 * being the actual security boundaries (see sites/rutube.ts message handler).
 */
export function generateSessionId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    /* swallow */
  }
  try {
    const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } })
      .crypto;
    if (c?.getRandomValues) {
      const buf = new Uint8Array(16);
      c.getRandomValues(buf);
      // RFC4122 §4.4 v4 layout. Non-null assertions: buf is a fixed-
      // length Uint8Array(16), so indexes 6 and 8 always exist;
      // noUncheckedIndexedAccess can't see that.
      buf[6] = (buf[6]! & 0x0f) | 0x40;
      buf[8] = (buf[8]! & 0x3f) | 0x80;
      const hex = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    /* swallow */
  }
  return `vs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
