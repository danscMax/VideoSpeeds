/**
 * Trusted Types friendly innerHTML setter, scoped to LOCAL extension UI
 * sinks only (audit M4).
 *
 * Why: YouTube enforces `require-trusted-types-for 'script'` which blocks
 * direct `element.innerHTML = ...`. We register a permissive policy under
 * a dedicated name so we can still build settings modals, hotkey blocks,
 * etc. without sanitization theatre. The strings we feed in here are
 * built from trusted templates in our own code -- they never carry
 * user-supplied HTML; user-facing strings go through `escHtml` first.
 *
 * If the policy registration fails (page already created a same-named
 * policy, or trustedTypes is unavailable), fall back to a DOMParser-based
 * setter that works regardless of CSP.
 */

const POLICY_NAME = 'video-speeds-policy';

let trustedPolicy: { createHTML: (input: string) => string } | null = null;

try {
  // Some sites (or older browsers) lack trustedTypes entirely; some have
  // already registered a policy under our name during tests / hot reload.
  // Both are fine -- we'll fall back to DOMParser.
  const tt = (globalThis as unknown as {
    trustedTypes?: { createPolicy?: (n: string, p: { createHTML: (s: string) => string }) => unknown };
  }).trustedTypes;
  if (tt && typeof tt.createPolicy === 'function') {
    trustedPolicy = tt.createPolicy(POLICY_NAME, {
      createHTML: (input: string) => input,
    }) as { createHTML: (input: string) => string };
  }
} catch {
  // duplicate-policy-name or sandbox restriction; DOMParser path takes over.
  trustedPolicy = null;
}

/**
 * Replace the contents of an element with a trusted HTML string.
 *
 * Two-tier fallback: trustedTypes -> direct innerHTML -> DOMParser. The
 * last branch is the "Trusted Types is enforced and we don't have a
 * policy" path; we move parsed nodes one-by-one into the target so the
 * page's CSP can't object.
 */
export function safeSetInnerHTML(element: Element, html: string): void {
  try {
    if (trustedPolicy) {
      // The cast here is intentional: TT policies return a `TrustedHTML`
      // brand on browsers that support it, but the runtime accepts it on
      // the innerHTML setter without complaint.
      (element as unknown as { innerHTML: unknown }).innerHTML =
        trustedPolicy.createHTML(html);
      return;
    }
    element.innerHTML = html;
  } catch {
    // Last-ditch: DOMParser doesn't trip Trusted Types checks because we
    // don't write to .innerHTML on a live element.
    try {
      const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
      const fresh = Array.from(doc.body.childNodes).map((n) => n.cloneNode(true));
      element.replaceChildren(...fresh);
    } catch {
      // If even DOMParser fails we surrender silently rather than throw
      // out of a UI-render path. Caller will see an empty element.
    }
  }
}
