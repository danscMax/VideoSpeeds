/**
 * Site detection from `location.hostname`. The single source of truth for
 * "which Site does this content script live on". Returns null on the rare
 * case the script ends up on an unrelated host (defensive -- the manifest
 * already restricts matches).
 */

import type { Site } from '../app/ports';

export function detectSite(host: string = safeHostname(), pathname?: string): Site | null {
  const h = host.toLowerCase();
  // Anchored regex on both sides — `includes('youtube.com')` would match
  // `youtube.com.evil.tld`, `evil-youtube.com.example.org`, `myyoutube.community`.
  // The manifest filters content-script injection but `detectSite` is also
  // called from the popup for arbitrary tab URLs (audit 2026-05-09).
  if (/(?:^|\.)youtube\.com$/.test(h)) return 'youtube';
  if (/(?:^|\.)rutube\.ru$/.test(h)) return 'rutube';
  if (/(?:^|\.)dzen\.ru$/.test(h)) return 'dzen';
  // VK ships its video product on a dedicated domain and as a section of the
  // social network; both serve the same player.
  if (/(?:^|\.)vkvideo\.ru$/.test(h)) return 'vk';
  // vk.com/vk.ru is a whole social network and only its video section is ours.
  // When the caller knows the path — the popup does, from the active tab — the
  // scope is applied here rather than being re-derived downstream, so the popup
  // cannot claim "you are on VK" on a feed page where no content script ever
  // ran and every control would silently do nothing.
  if (/(?:^|\.)vk\.(?:com|ru)$/.test(h)) {
    return pathname === undefined || isVkVideoPath(pathname) ? 'vk' : null;
  }
  return null;
}

/**
 * Allow-list of VK paths that hold a single playable video.
 *
 *   /video-123_456   — a video, in both the vkvideo.ru and vk.com forms
 *   /video_ext.php   — the embeddable player
 *
 * `/video` alone is the catalogue and `/playlist/...` a grid; both are walls of
 * preview tiles, which is exactly what the heuristic discovery strategy would
 * lock onto. VK is resolved almost entirely by that strategy, so this filter is
 * the main thing keeping it pointed at a real player.
 */
export function isVkVideoPath(pathname: string): boolean {
  return /^\/video(_ext\.php|-?\d)/.test(pathname);
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

export function isVk(host?: string): boolean {
  return detectSite(host) === 'vk';
}

function safeHostname(): string {
  try {
    return location.hostname;
  } catch {
    return '';
  }
}
