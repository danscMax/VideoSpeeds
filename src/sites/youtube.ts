/**
 * YouTube site bootstrap.
 *
 * SPA navigation hook = listening for `yt-navigate-finish` -- a CustomEvent
 * YouTube fires on its own when a watch-page transition completes. The
 * event crosses the isolated/main boundary, so we don't need a page-world
 * script for YouTube (audit C4 / Wave 1.0d -- MAIN world is RuTube only).
 */

import type { AppContext } from '../app/context';

export interface YouTubeSiteHandle {
  /** Called whenever YouTube finishes a navigation (new video). */
  onNavigation(fn: () => void): void;
}

/**
 * FEAT-015: stable per-channel key for the speed-memory map. Reads the
 * channel link from the watch-page metadata; YouTube renders it a beat
 * after yt-navigate-finish, so callers retry with a small delay.
 *
 * Three things this has to survive (all measured on live pages, 2026-08-20):
 *
 *  - The href can be ABSOLUTE. A viewer running other YouTube add-ons had
 *    `https://www.youtube.com/@handle/videos` where a clean profile has
 *    `/@handle`; the old pattern was anchored to a leading slash, so the
 *    channel was never identified and the whole feature stayed dead.
 *  - The SAME channel is linked as `/@handle` on one page and
 *    `/channel/UC…` on another. Keying on whichever link happens to come
 *    first splits one channel's memory across two keys, which looks exactly
 *    like "the speed was not remembered". Prefer the handle, which is what
 *    the owner block carries in practice, and fall back to the id.
 *  - Handles are not ASCII-only (`/@Дайте_Пушку`), so no `\w` shortcuts.
 */
export function extractYouTubeChannelKey(doc: Document = document): string | null {
  const scope =
    doc.querySelector('ytd-watch-metadata #owner') ??
    doc.querySelector('#owner') ??
    doc.querySelector('ytd-watch-metadata');
  const links = scope
    ? [...scope.querySelectorAll<HTMLAnchorElement>('a[href]')]
    : [...doc.querySelectorAll<HTMLAnchorElement>('ytd-watch-metadata ytd-channel-name a[href]')];

  let byId: string | null = null;
  for (const link of links) {
    const path = channelPathOf(link);
    if (!path) continue;
    if (path.startsWith('@')) return `yt:${path}`; // handle wins — most stable
    if (!byId) byId = `yt:${path}`;
  }
  return byId;
}

/** First path segment of a YouTube channel link, or null if it is not one.
 *  Returns `@handle` or `channel/UC…`; the trailing `/videos`, `/featured`
 *  and friends are dropped. */
function channelPathOf(link: HTMLAnchorElement): string | null {
  const raw = link.getAttribute('href');
  if (!raw) return null;
  let url: URL;
  try {
    // `link.href` would resolve relative hrefs too, but a detached document
    // in tests has no base — resolve against the page location explicitly.
    url = new URL(raw, baseUriOf(link));
  } catch {
    return null;
  }
  if (url.hostname && !/(^|\.)youtube\.com$/.test(url.hostname)) return null;
  // URL percent-encodes a non-ASCII handle; decode so the key stays readable
  // and matches whichever form the next page happens to render.
  const seg = url.pathname.split('/').filter(Boolean).map(decodeSafe);
  const first = seg[0];
  if (!first) return null;
  if (first.startsWith('@') && first.length > 1) return first;
  if (first === 'channel' && seg[1]) return `channel/${seg[1]}`;
  return null;
}

function decodeSafe(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

function baseUriOf(link: HTMLAnchorElement): string {
  return link.ownerDocument?.baseURI || 'https://www.youtube.com/';
}

/** FEAT-019/020: YouTube player state probes. */
export function isYouTubeAdShowing(video: HTMLVideoElement): boolean {
  return !!video.closest('.html5-video-player')?.classList.contains('ad-showing');
}

export function isYouTubeShortsPath(pathname: string = location.pathname): boolean {
  return pathname.startsWith('/shorts');
}

export function bootstrapYouTubeSite(ctx: AppContext): YouTubeSiteHandle {
  const subscribers = new Set<() => void>();

  ctx.cleanup.addEventListener(window, 'yt-navigate-finish', () => {
    ctx.logger.debug('site:youtube yt-navigate-finish');
    for (const fn of subscribers) {
      try {
        fn();
      } catch (e) {
        ctx.logger.error('site:youtube nav handler', e);
      }
    }
  });

  return {
    onNavigation(fn) {
      subscribers.add(fn);
    },
  };
}
