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
