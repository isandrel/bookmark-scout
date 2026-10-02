import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { matchAIServicesSearch } from '@/components/options/AIServiceEditor';
import { setLanguage, t } from '@/hooks/use-i18n';
import { getStoredAIProviderConfig, saveStoredAIProviderConfig } from '@/lib/ai-provider-storage';
import {
  addAIService,
  deleteAIService,
  duplicateAIService,
  getAIServicesState,
  getDefaultAIService,
  setDefaultAIService,
  updateAIService,
} from '@/lib/ai-services-storage';
import { saveSettings } from '@/lib/settings-storage';
import { getActiveAISettings } from '@/services/ai-settings';

beforeEach(async () => {
  fakeBrowser.reset();
  // Reading settings applies the stored language, so store English before selecting it.
  await saveSettings({ language: 'en' });
  setLanguage('en');
});

describe('AI services search text', () => {
  it('matches editor fields and marks the ones under More settings', () => {
    expect(matchAIServicesSearch('api key')).toEqual([
      expect.objectContaining({ advanced: false }),
    ]);
    expect(matchAIServicesSearch('base url')).toEqual([expect.objectContaining({ advanced: true })]);
    expect(matchAIServicesSearch('extra headers')).toHaveLength(1);
    expect(matchAIServicesSearch('  ')).toEqual([]);
  });
});

describe('API key format message', () => {
  it('reads correctly for provider names that start with a vowel', () => {
    expect(t('options_apiKeyInvalidFormat', 'OpenAI')).toBe(
      "This doesn't look like an API key for OpenAI. It was not saved.",
    );
  });
});

describe('named AI services', () => {
  it('derives services from a single-provider setup without writing anything', async () => {
    await saveSettings({ aiProvider: 'anthropic', aiModel: 'claude-x' });
    await saveStoredAIProviderConfig('anthropic', { apiKey: 'sk-ant-synthetic' });
    await saveStoredAIProviderConfig('groq', { apiKey: 'gsk_synthetic' });

    const state = await getAIServicesState();
    expect(state.defaultServiceId).toBe('anthropic');
    expect(state.services.map((service) => [service.id, service.model])).toEqual([
      ['anthropic', 'claude-x'],
      ['groq', expect.any(String)],
    ]);
    expect(await fakeBrowser.storage.local.get('bookmark-scout-ai-services')).toEqual({});
    // The derived default resolves to the same settings as before named services.
    await saveSettings({ aiEnabled: true });
    await expect(getActiveAISettings(true)).resolves.toMatchObject({
      provider: 'anthropic',
      model: 'claude-x',
      apiKey: 'sk-ant-synthetic',
    });
  });

  it('keeps two services of the same provider apart, each with its own key', async () => {
    const first = await addAIService('custom', 'Work proxy');
    const second = await addAIService('custom', 'Home proxy');
    expect(first.id).not.toBe(second.id);
    await saveStoredAIProviderConfig(first.id, { apiKey: 'first', baseUrl: 'https://a.test/v1' });
    await saveStoredAIProviderConfig(second.id, { apiKey: 'second', baseUrl: 'https://b.test/v1' });
    await updateAIService(second.id, { model: 'home-model' });
    await setDefaultAIService(second.id);

    await expect(getActiveAISettings(true)).resolves.toMatchObject({
      apiKey: 'second',
      baseUrl: 'https://b.test/v1',
      model: 'home-model',
    });
    expect((await getDefaultAIService())?.name).toBe('Home proxy');
  });

  it('duplicates a service with its credentials and deletes credentials with a service', async () => {
    const source = await addAIService('openrouter', 'Router');
    await saveStoredAIProviderConfig(source.id, { apiKey: 'sk-or-synthetic' });
    const copy = await duplicateAIService(source.id);
    expect(copy?.name).toBe('Router (copy)');
    expect((await getStoredAIProviderConfig(copy?.id ?? '')).apiKey).toBe('sk-or-synthetic');

    await setDefaultAIService(source.id);
    await deleteAIService(source.id);
    expect(await getStoredAIProviderConfig(source.id)).toEqual({});
    const state = await getAIServicesState();
    expect(state.services.map((service) => service.id)).toContain(copy?.id);
    expect(state.services.map((service) => service.id)).not.toContain(source.id);
    // Another enabled service becomes the default when the default is deleted.
    expect(state.defaultServiceId).not.toBe(source.id);
    expect(state.defaultServiceId).toBeDefined();
  });

  it('falls back to the next enabled service when the default is turned off', async () => {
    // A fresh install already implies one service: the default synced provider.
    const initial = await getAIServicesState();
    expect(initial.services).toHaveLength(1);
    const second = await addAIService('groq');
    await updateAIService(initial.defaultServiceId ?? '', { enabled: false });
    expect((await getAIServicesState()).defaultServiceId).toBe(second.id);
  });
});
