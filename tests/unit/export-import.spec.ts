import { describe, expect, it } from 'vitest';
import {
  buildExportEnvelope,
  importSettingsFromText,
} from '../../src/ui/settings/export-import';
import { createMockContext } from '../helpers/mock-context';

describe('buildExportEnvelope', () => {
  it('wraps live settings with type, version, exportedAt, site', async () => {
    const { ctx } = await createMockContext({
      site: 'rutube',
      initialSettings: { sliderPosition: 'bottom' },
    });
    const env = buildExportEnvelope(ctx);
    expect(env.type).toBe('video-speeds-settings');
    expect(env.version).toBe(1);
    expect(env.site).toBe('rutube');
    expect(env.settings.sliderPosition).toBe('bottom');
    expect(typeof env.exportedAt).toBe('string');
  });
});

describe('importSettingsFromText', () => {
  it('imports an envelope and merges its settings into the store', async () => {
    const { ctx, settingsStore } = await createMockContext({ site: 'youtube' });
    const json = JSON.stringify({
      type: 'video-speeds-settings',
      version: 1,
      exportedAt: '2026-04-26T12:00:00Z',
      site: 'youtube',
      settings: { sliderPosition: 'video', rememberSpeed: false },
    });

    const result = await importSettingsFromText(ctx, json);
    expect(result.ok).toBe(true);
    expect(settingsStore.getKey('sliderPosition')).toBe('video');
    expect(settingsStore.getKey('rememberSpeed')).toBe(false);
  });

  it('accepts a bare settings object (legacy userscript export)', async () => {
    const { ctx, settingsStore } = await createMockContext({ site: 'youtube' });
    const result = await importSettingsFromText(
      ctx,
      JSON.stringify({ sliderPosition: 'bottom' }),
    );
    expect(result.ok).toBe(true);
    expect(settingsStore.getKey('sliderPosition')).toBe('bottom');
  });

  it('returns failure for malformed JSON', async () => {
    const { ctx } = await createMockContext({ site: 'youtube' });
    const result = await importSettingsFromText(ctx, '{not json');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/invalid/i);
  });

  it('returns failure for non-object payload', async () => {
    const { ctx } = await createMockContext({ site: 'youtube' });
    const result = await importSettingsFromText(ctx, '"just a string"');
    expect(result.ok).toBe(false);
  });

  it('rejects malformed sub-shapes per-field via SettingsStore validator', async () => {
    // Audit M11: update() now sanitizes the patch -- previously this
    // test documented the gap, now it documents the fix.
    const { ctx, settingsStore } = await createMockContext({ site: 'youtube' });
    const json = JSON.stringify({
      sliderPosition: 'INVALID',
      rememberSpeed: 'yes',
      hidePremium: true,    // valid -- should land
    });
    const result = await importSettingsFromText(ctx, json);
    expect(result.ok).toBe(true);
    // Invalid fields dropped, valid ones preserved.
    expect(settingsStore.getKey('sliderPosition')).toBe('right');  // default
    expect(settingsStore.getKey('rememberSpeed')).toBe(true);      // default
    expect(settingsStore.getKey('hidePremium')).toBe(true);        // imported
  });

  it('strips __migrated_from_tm from imports (audit M13)', async () => {
    const { ctx, settingsStore } = await createMockContext({ site: 'youtube' });
    const json = JSON.stringify({
      type: 'video-speeds-settings',
      version: 1,
      site: 'youtube',
      settings: { __migrated_from_tm: true, sliderPosition: 'video' },
    });
    const result = await importSettingsFromText(ctx, json);
    expect(result.ok).toBe(true);
    expect(settingsStore.getKey('sliderPosition')).toBe('video');
    // Critical: import must NOT poison the destination's migration state.
    expect(settingsStore.getKey('__migrated_from_tm')).toBeUndefined();
  });
});

describe('buildExportEnvelope - audit M13', () => {
  it('strips __migrated_from_tm from the exported settings', async () => {
    const { ctx, settingsStore } = await createMockContext({ site: 'youtube' });
    await settingsStore.update({ __migrated_from_tm: true, sliderPosition: 'video' });
    const env = buildExportEnvelope(ctx);
    expect(env.settings.sliderPosition).toBe('video');
    expect((env.settings as { __migrated_from_tm?: boolean }).__migrated_from_tm).toBeUndefined();
  });
});
