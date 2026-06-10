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
 * Normalises both /@handle and /channel/UC… link shapes.
 */
export function extractYouTubeChannelKey(doc: Document = document): string | null {
  const link = doc.querySelector<HTMLAnchorElement>(
    'ytd-watch-metadata ytd-channel-name a[href], #owner #channel-name a[href]',
  );
  const href = link?.getAttribute('href') ?? '';
  const m = /^\/(@[\w.-]+|channel\/[\w-]+)/.exec(href);
  return m ? `yt:${m[1]}` : null;
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
