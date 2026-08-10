/**
 * Site detection from `location.hostname`. The single source of truth for
 * "which Site does this content script live on". Returns null on the rare
 * case the script ends up on an unrelated host (defensive -- the manifest
 * already restricts matches).
 */

import type { Site } from '../app/ports';

export function detectSite(host: string = safeHostname()): Site | null {
  const h = host.toLowerCase();
  // Anchored regex on both sides — `includes('youtube.com')` would match
  // `youtube.com.evil.tld`, `evil-youtube.com.example.org`, `myyoutube.community`.
  // The manifest filters content-script injection but `detectSite` is also
  // called from the popup for arbitrary tab URLs (audit 2026-05-09).
  if (/(?:^|\.)youtube\.com$/.test(h)) return 'youtube';
  if (/(?:^|\.)rutube\.ru$/.test(h)) return 'rutube';
  if (/(?:^|\.)dzen\.ru$/.test(h)) return 'dzen';
  return null;
}

export function isYouTube(host?: string): boolean {
  return detectSite(host) === 'youtube';
}

export function isRutube(host?: string): boolean {
  return detectSite(host) === 'rutube';
}

export function isDzen(host?: string): boolean {
  return detectSite(host) === 'dzen';
}

function safeHostname(): string {
  try {
    return location.hostname;
  } catch {
    return '';
  }
}
