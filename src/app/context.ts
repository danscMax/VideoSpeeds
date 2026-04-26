import type { CleanupRegistry } from './cleanup';
import type {
  DiagnosticsPort,
  DiscoveryPort,
  Logger,
  SettingsStore,
  Site,
  SpeedStore,
  Translator,
  UiPort,
} from './ports';

/**
 * Immutable bundle of collaborators passed through every feature module.
 *
 * Build it once in the orchestrator (Wave 1.10 `bootstrap(ctx)`), then thread
 * it through. No feature module should reach for globals or import another
 * feature's concrete impl — they only see this interface.
 *
 * Lifetime = one content-script load. On WXT invalidation we call
 * `ctx.cleanup.dispose()` and drop the reference; the next load creates a
 * fresh AppContext with a fresh CleanupRegistry.
 */
export interface AppContext {
  readonly site: Site;
  readonly settingsStore: SettingsStore;
  readonly speedStore: SpeedStore;
  readonly ui: UiPort;
  readonly discovery: DiscoveryPort;
  readonly diagnostics: DiagnosticsPort;
  readonly cleanup: CleanupRegistry;
  readonly logger: Logger;
  readonly i18n: Translator;
}
