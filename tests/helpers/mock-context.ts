/**
 * Test helper: build a minimal AppContext for unit tests against modules
 * that depend on ctx (controller, future UI handlers, sites bootstrap).
 *
 * Backed by createMemoryStorageAdapter + real SettingsStore / SpeedStore +
 * stub UI / discovery / diagnostics ports. Tests can override any field
 * via the `overrides` parameter.
 */

import { vi } from 'vitest';
import { CleanupRegistry } from '../../src/app/cleanup';
import type { AppContext } from '../../src/app/context';
import type {
  DiagnosticReport,
  DiagnosticsPort,
  DiscoveryPort,
  Logger,
  Settings,
  Site,
  Translator,
  UiPort,
} from '../../src/app/ports';
import { createMemoryStorageAdapter, type StorageAdapter } from '../../src/storage/adapter';
import { createSettingsStore, type SettingsStoreImpl } from '../../src/storage/settings-store';
import { createSpeedStore, type SpeedStoreImpl } from '../../src/storage/speed-store';
import { createTranslator } from '../../src/i18n/translator';

export interface MockUi extends UiPort {
  refreshButtons: ReturnType<typeof vi.fn>;
  refreshSlider: ReturnType<typeof vi.fn>;
  showNotification: ReturnType<typeof vi.fn>;
  applyLayout: ReturnType<typeof vi.fn>;
}

export function createMockUi(): MockUi {
  return {
    refreshButtons: vi.fn(),
    refreshSlider: vi.fn(),
    showNotification: vi.fn(),
    applyLayout: vi.fn(),
  };
}

export interface MockDiscovery extends DiscoveryPort {
  resolve: ReturnType<typeof vi.fn>;
}

export function createMockDiscovery(initial?: { video?: Element | null }): MockDiscovery {
  const video = initial?.video ?? null;
  return {
    hydrate: vi.fn(async () => {}),
    resolve: vi.fn((key: string) => (key === 'video' ? video : null)),
    invalidate: vi.fn(),
    cacheStats: vi.fn(() => ({ hits: 0, misses: 0, ready: true })),
  };
}

export function createMockDiagnostics(): DiagnosticsPort {
  return {
    report: vi.fn(() => ({} as DiagnosticReport)),
    isHealthy: vi.fn(() => true),
    killSwitchEngaged: vi.fn(() => false),
    trip: vi.fn(),
  };
}

export function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

export interface MockContextOptions {
  site?: Site;
  initialSettings?: Partial<Settings>;
  initialSpeed?: number;
  ui?: UiPort;
  discovery?: DiscoveryPort;
  diagnostics?: DiagnosticsPort;
  logger?: Logger;
  i18n?: Translator;
  adapter?: StorageAdapter;
}

export interface MockContextHandle {
  ctx: AppContext;
  settingsStore: SettingsStoreImpl;
  speedStore: SpeedStoreImpl;
  cleanup: CleanupRegistry;
  ui: UiPort;
  discovery: DiscoveryPort;
  adapter: StorageAdapter;
}

export async function createMockContext(opts: MockContextOptions = {}): Promise<MockContextHandle> {
  const site: Site = opts.site ?? 'youtube';
  const adapter = opts.adapter ?? createMemoryStorageAdapter();
  const settingsStore = createSettingsStore(adapter);
  const speedStore = createSpeedStore(adapter);
  await settingsStore.init(site);
  await speedStore.init(site);
  if (opts.initialSettings) await settingsStore.update(opts.initialSettings);
  if (opts.initialSpeed != null) await speedStore.setCurrent(opts.initialSpeed);

  const ui = opts.ui ?? createMockUi();
  const discovery = opts.discovery ?? createMockDiscovery();
  const diagnostics = opts.diagnostics ?? createMockDiagnostics();
  const logger = opts.logger ?? createMockLogger();
  const i18n = opts.i18n ?? createTranslator(settingsStore.getKey('language'));
  const cleanup = new CleanupRegistry();

  const ctx: AppContext = {
    site,
    settingsStore,
    speedStore,
    ui,
    discovery,
    diagnostics,
    cleanup,
    logger,
    i18n,
  };

  return { ctx, settingsStore, speedStore, cleanup, ui, discovery, adapter };
}
