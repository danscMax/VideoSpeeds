/**
 * Site detection from `location.hostname`. The single source of truth for
 * "which Site does this content script live on". Returns null on the rare
 * case the script ends up on an unrelated host (defensive -- the manifest
 * already restricts matches).
 */

import type { Site } from '../app/ports';

export function detectSite(host: string = safeHostname()): Site | null {
  const h = host.toLowerCase();
  if (h.includes('youtube.com')) return 'youtube';
  if (/(?:^|\.)rutube\.ru$/.test(h)) return 'rutube';
  return null;
}

export function isYouTube(host?: string): boolean {
  return detectSite(host) === 'youtube';
}

export function isRutube(host?: string): boolean {
  return detectSite(host) === 'rutube';
}

function safeHostname(): string {
  try {
    return location.hostname;
  } catch {
    return '';
  }
}
