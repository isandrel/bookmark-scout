import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { matchAIServicesSearch } from '@/components/options/AIServiceEditor';
import { setLanguage, t } from '@/hooks/use-i18n';
import {
  aiModelListValue,
  aiProviderConfigValue,
  getCachedModelList,
  getStoredAIProviderConfig,
  saveCachedModelList,
  saveStoredAIProviderConfig,
} from '@/lib/ai-provider-storage';
import {
  addAIService,
  deleteAIService,
  duplicateAIService,
  getAIServicesState,
  getDefaultAIService,
  reorderAIServices,
  setDefaultAIService,
  updateAIService,
} from '@/lib/ai-services-storage';
import { saveSettings } from '@/lib/settings-storage';
import { getActiveAISettings } from '@/services/ai-settings';
import { readStoredRaw, STORAGE_ITEMS, seedStored } from './storage-helpers';

beforeEach(async () => {
  fakeBrowser.reset();
  // Reading settings applies the stored language, so store English before selecting it.
  await saveSettings({ language: 'en' });
  setLanguage('en');
});

describe('AI services search text', () => {
  it('matches editor fields and marks the ones under More settings', () => {
    expect(matchAIServicesSearch('api key')).toEqual([
      expect.objectContaining({
        advanced: false,
        editor: true,
        text: ['API Key', expect.any(String)],
      }),
    ]);
    // The panel's own title is always shown; editor fields only inside an open service.
    expect(matchAIServicesSearch('ai services')).toEqual([
      expect.objectContaining({ editor: false }),
    ]);
    expect(matchAIServicesSearch('base url')).toEqual([
      expect.objectContaining({ advanced: true }),
    ]);
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
  it('starts with no services and no default, and stores nothing until one is added', async () => {
    expect(await getAIServicesState()).toEqual({ services: [], defaultServiceId: undefined });
    await expect(getActiveAISettings(true, 'askAI')).rejects.toThrow();
    expect(await readStoredRaw(STORAGE_ITEMS.aiServices)).toBeUndefined();

    const first = await addAIService('anthropic');
    await saveStoredAIProviderConfig(first.id, { apiKey: 'sk-ant-synthetic' });
    expect((await getAIServicesState()).defaultServiceId).toBe(first.id);
    await expect(getActiveAISettings(true, 'askAI')).resolves.toMatchObject({
      provider: 'anthropic',
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

    await expect(getActiveAISettings(true, 'askAI')).resolves.toMatchObject({
      apiKey: 'second',
      baseUrl: 'https://b.test/v1',
      model: 'home-model',
    });
    expect((await getDefaultAIService())?.name).toBe('Home proxy');
  });

  it('reorders services, and the order picks the fallback for tools the default cannot run', async () => {
    const builtin = await addAIService('chrome_builtin');
    const first = await addAIService('custom', 'First');
    const second = await addAIService('custom', 'Second');
    await saveStoredAIProviderConfig(first.id, { apiKey: 'first', baseUrl: 'https://a.test/v1' });
    await saveStoredAIProviderConfig(second.id, { apiKey: 'second', baseUrl: 'https://b.test/v1' });
    await setDefaultAIService(builtin.id);
    // Built-in AI only suggests folders, so Ask AI uses the first other enabled service.
    await expect(getActiveAISettings(true, 'askAI')).resolves.toMatchObject({ apiKey: 'first' });

    await reorderAIServices([builtin.id, second.id, first.id, 'gone']);
    expect((await getAIServicesState()).services.map((service) => service.name)).toEqual([
      builtin.name,
      'Second',
      'First',
    ]);
    await expect(getActiveAISettings(true, 'askAI')).resolves.toMatchObject({ apiKey: 'second' });
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

  it('keeps one built-in AI service: adding or copying it again returns the existing one', async () => {
    const hosted = await addAIService('openai');
    const builtin = await addAIService('chrome_builtin');
    // Two quick adds (a double click, or two tabs) still leave one.
    const [again, third] = await Promise.all([
      addAIService('chrome_builtin', 'Another name'),
      addAIService('chrome_builtin'),
    ]);
    expect(again.id).toBe(builtin.id);
    expect(third.id).toBe(builtin.id);
    expect(await duplicateAIService(builtin.id)).toBeUndefined();
    const state = await getAIServicesState();
    expect(state.services.map((service) => service.provider)).toEqual(['openai', 'chrome_builtin']);
    expect(state.services.find((service) => service.id === builtin.id)?.name).toBe(builtin.name);
    expect(state.defaultServiceId).toBe(hosted.id);
  });

  it('falls back to the next enabled service when the default is turned off', async () => {
    const first = await addAIService('openai');
    const second = await addAIService('groq');
    expect((await getAIServicesState()).defaultServiceId).toBe(first.id);
    await updateAIService(first.id, { enabled: false });
    expect((await getAIServicesState()).defaultServiceId).toBe(second.id);
  });
});

describe('stored AI data', () => {
  const service = (id: string, provider = 'openai') => ({
    id,
    name: id,
    provider,
    model: 'gpt-4o-mini',
    enabled: true,
  });

  it('drops a malformed service, a repeated id, or an unknown provider on its own', async () => {
    await seedStored(STORAGE_ITEMS.aiServices, {
      services: [
        service('a'),
        { id: 'b', provider: 'openai' },
        service('a', 'groq'),
        service('c', 'no-such-provider'),
        service('d', 'groq'),
      ],
      defaultServiceId: 'a',
    });
    const state = await getAIServicesState();
    expect(state.services.map(({ id, provider }) => [id, provider])).toEqual([
      ['a', 'openai'],
      ['d', 'groq'],
    ]);
    expect(state.defaultServiceId).toBe('a');
  });

  it('drops malformed credentials per service and stores no model with them', async () => {
    await seedStored(STORAGE_ITEMS.aiCredentials, {
      good: { apiKey: 'sk-synthetic', options: { organization: 'org' } },
      bad: { apiKey: 42 },
      text: 'nope',
    });
    expect(await aiProviderConfigValue.get()).toEqual({
      good: { apiKey: 'sk-synthetic', options: { organization: 'org' } },
    });
  });

  it('keeps a model list per service until it expires, and removes it with the service', async () => {
    const day = 24 * 60 * 60 * 1000;
    const first = await addAIService('custom', 'First');
    const second = await addAIService('custom', 'Second');
    const list = (id: string, fetchedAt: number) => ({
      endpoint: 'https://a.test/v1',
      models: [{ id, name: id }],
      fetchedAt,
    });
    await saveCachedModelList(first.id, list('one', 0), 0);
    await saveCachedModelList(second.id, list('two', 0), 0);

    expect((await getCachedModelList(first.id, 'https://a.test/v1', day))?.models).toEqual([
      { id: 'one', name: 'one' },
    ]);
    expect(await getCachedModelList(first.id, 'https://other.test/v1', day)).toBeUndefined();
    // Past the configured age (7 days) a list is no longer offered, and the next save drops it.
    expect(await getCachedModelList(first.id, 'https://a.test/v1', 8 * day)).toBeUndefined();
    await saveCachedModelList(second.id, list('two', 8 * day), 8 * day);
    expect(Object.keys(await aiModelListValue.get())).toEqual([second.id]);

    await deleteAIService(second.id);
    expect(await readStoredRaw(STORAGE_ITEMS.aiModelCache)).toBeUndefined();
  });
});
