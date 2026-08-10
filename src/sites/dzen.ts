/**
 * Dzen video site bootstrap (dzen.ru/video/watch/…).
 *
 * Dzen is a React SPA whose router swaps the whole viewer without a single DOM
 * event we could hear from the isolated world, so navigation comes from the
 * MAIN-world history hook via the shared bridge — the same one RuTube uses.
 *
 * There is deliberately nothing else here. RuTube's bootstrap also owns two
 * site-specific stylesheets (hide title, hide Premium banners); Dzen has no
 * equivalent toggle, and inventing one to make the two files look alike would
 * be shipping a setting nobody asked for.
 */

import type { AppContext } from '../app/context';
import { createNavigationBridge, type NavigationBridge } from './history-bridge';

export function bootstrapDzenSite(ctx: AppContext): NavigationBridge {
  return createNavigationBridge(ctx, 'dzen');
}
