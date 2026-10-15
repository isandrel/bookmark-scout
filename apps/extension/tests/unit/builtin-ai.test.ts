/**
 * Chrome's built-in AI with a fake `LanguageModel` (tests/unit/fake-language-model.ts): the AI SDK
 * adapter, the model's state and download, which service each AI feature uses, and folder
 * suggestions from a shortlist with the word match as the fallback.
 */
import { generateObject } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { z } from 'zod';
import { setLanguage, t } from '@/hooks/use-i18n';
import { aiActivityValue } from '@/lib/ai-activity-storage';
import { aiProviderFilesSchema } from '@/lib/config/ai-provider-schema';
import { buildFolderRankingIndex } from '@/lib/folder-ranking';
import { saveSettings } from '@/lib/settings-storage';
import { createAIModel } from '@/services/ai-client.lazy';
import {
  BUILTIN_AI_PROVIDER,
  getAvailableProviders,
  isBuiltinProvider,
  providerSupportsFeature,
} from '@/services/ai-models';
import { isAISetUp, pickAIService } from '@/services/ai-settings';
import {
  builtinAIConfig,
  canOfferBuiltinAI,
  createWarmBuiltinSessions,
  downloadBuiltinAIModel,
  getBuiltinAIStatus,
  getBuiltinAIUnavailableReason,
} from '@/services/builtin-ai';
import {
  buildBuiltinFolderRequest,
  recommendFoldersOnDevice,
  shortlistFolders,
} from '@/services/builtin-ai-folders';
import { createBuiltinModel } from '@/services/builtin-ai-model.lazy';
import type { BookmarkTreeNode } from '@/types';
import { readConfigToml } from '../config-files';
import { installFakeLanguageModel } from './fake-language-model';

const POLICY_ERROR = Object.assign(
  new Error(
    'The on-device model is not available because the enterprise policy disables the feature.',
  ),
  { name: 'NotSupportedError' },
);

beforeEach(async () => {
  fakeBrowser.reset();
  await saveSettings({ language: 'en' });
  setLanguage('en');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('built-in AI provider file', () => {
  it('is one keyless provider, listed first, for folder suggestions only', () => {
    expect(BUILTIN_AI_PROVIDER).toBe('chrome_builtin');
    const provider = BUILTIN_AI_PROVIDER as AIProvider;
    expect(isBuiltinProvider(provider)).toBe(true);
    expect(getAvailableProviders()[0]?.id).toBe(provider);
    expect(providerSupportsFeature(provider, 'folderRecommendation')).toBe(true);
    for (const feature of ['askAI', 'autoTagging', 'summarizer', 'reorganization'] as const) {
      expect(providerSupportsFeature(provider, feature), feature).toBe(false);
    }
    // A provider file without `features` serves every feature.
    expect(providerSupportsFeature('openai', 'askAI')).toBe(true);
  });

  it('rejects a built-in provider file that asks for a key, endpoint, or model list', () => {
    const file = readConfigToml('ai/providers/chrome-builtin.toml');
    expect(aiProviderFilesSchema.safeParse({ builtin: file }).success).toBe(true);
    for (const change of [
      { requires_api_key: true },
      { base_url: 'https://example.com/v1' },
      { model_list: 'openai' },
    ]) {
      expect(aiProviderFilesSchema.safeParse({ builtin: { ...file, ...change } }).success).toBe(
        false,
      );
    }
  });
});

describe('which service an AI feature uses', () => {
  const service = (id: string, provider: string, enabled = true) => ({
    id,
    name: id,
    provider: provider as AIProvider,
    model: '',
    enabled,
  });
  const builtin = service('builtin', 'chrome_builtin');
  const hosted = service('hosted', 'openai');
  const credentials = { hosted: { apiKey: 'sk-test' } };

  it('uses the default service when its provider offers the feature', () => {
    const state = { services: [builtin, hosted], defaultServiceId: 'builtin' };
    expect(pickAIService(state, 'folderRecommendation')?.id).toBe('builtin');
    expect(pickAIService(state)?.id).toBe('builtin');
  });

  it('falls back to the first enabled service that offers it, or none', () => {
    const state = { services: [builtin, hosted], defaultServiceId: 'builtin' };
    expect(pickAIService(state, 'askAI')?.id).toBe('hosted');
    expect(pickAIService(state, 'reorganization')?.id).toBe('hosted');
    expect(
      pickAIService(
        { services: [builtin, { ...hosted, enabled: false }], defaultServiceId: 'builtin' },
        'askAI',
      ),
    ).toBeUndefined();
    expect(
      pickAIService({ services: [builtin], defaultServiceId: 'builtin' }, 'askAI'),
    ).toBeUndefined();
    // A hosted default serves folder suggestions too.
    expect(
      pickAIService(
        { services: [hosted, builtin], defaultServiceId: 'hosted' },
        'folderRecommendation',
      )?.id,
    ).toBe('hosted');
  });

  it('counts the built-in model as set up only once it is downloaded and ready', () => {
    const state = { services: [builtin, hosted], defaultServiceId: 'builtin' };
    for (const status of ['unsupported', 'unavailable', 'downloadable', 'downloading'] as const) {
      expect(isAISetUp(state, credentials, 'folderRecommendation', status), status).toBe(false);
    }
    expect(isAISetUp(state, credentials, 'folderRecommendation', 'available')).toBe(true);
    expect(isAISetUp(state, credentials, 'folderRecommendation')).toBe(false);
    // Ask AI uses the hosted service, set up with its key, whatever the model's state.
    expect(isAISetUp(state, credentials, 'askAI', 'downloadable')).toBe(true);
    expect(isAISetUp(state, {}, 'askAI', 'available')).toBe(false);
  });
});

describe('built-in model state and download', () => {
  it('is unsupported without the Prompt API (Firefox)', async () => {
    expect(await getBuiltinAIStatus({ refresh: true })).toBe('unsupported');
    expect(canOfferBuiltinAI('unsupported')).toBe(false);
  });

  it('reports Chrome availability with the configured languages, read once per page', async () => {
    const fake = installFakeLanguageModel({ availability: 'downloadable' });
    expect(await getBuiltinAIStatus({ refresh: true })).toBe('downloadable');
    fake.options.availability = 'available';
    expect(await getBuiltinAIStatus()).toBe('downloadable');
    expect(await getBuiltinAIStatus({ refresh: true })).toBe('available');
    const availability = vi.mocked(globalThis.LanguageModel.availability);
    expect(availability).toHaveBeenLastCalledWith({
      expectedInputs: [{ type: 'text', languages: builtinAIConfig.session_languages }],
      expectedOutputs: [{ type: 'text', languages: builtinAIConfig.session_languages }],
    });
    expect(canOfferBuiltinAI('downloadable')).toBe(true);
    expect(canOfferBuiltinAI('unavailable')).toBe(false);
  });

  it('tells a policy that turned the model off from a computer that cannot run it', async () => {
    installFakeLanguageModel({ availability: 'unavailable', createError: POLICY_ERROR });
    expect(await getBuiltinAIUnavailableReason()).toBe('policy');
    installFakeLanguageModel({
      availability: 'unavailable',
      createError: Object.assign(new Error('The device is not eligible.'), {
        name: 'NotSupportedError',
      }),
    });
    expect(await getBuiltinAIUnavailableReason()).toBe('device');
  });

  it('downloads from a click with progress, then reads the state again', async () => {
    const fake = installFakeLanguageModel({ availability: 'downloadable', progress: [0.25, 1] });
    await getBuiltinAIStatus({ refresh: true });
    const progress: number[] = [];
    await downloadBuiltinAIModel((fraction) => progress.push(fraction));
    expect(progress).toEqual([0.25, 1]);
    expect(fake.creates).toHaveLength(1);
    expect(fake.creates[0]?.monitor).toBeTypeOf('function');
    expect(fake.destroyed).toBe(1);
    expect(await getBuiltinAIStatus()).toBe('available');
  });
});

describe('[mocked provider contract] built-in model adapter', () => {
  const schema = z.object({ folders: z.array(z.enum(['12', '34'])).max(2) });

  it('runs generateObject with the schema as a response constraint and one session per call', async () => {
    const fake = installFakeLanguageModel({ answer: '{"folders":["34","12"]}' });
    const calls: unknown[] = [];
    const { object } = await generateObject({
      model: createBuiltinModel({ modelId: 'gemini-nano', onCall: (call) => calls.push(call) }),
      schema,
      system: 'Pick folders.',
      prompt: 'Page title: Bun docs',
    });
    expect(object.folders).toEqual(['34', '12']);

    const [created] = fake.creates;
    expect(created?.initialPrompts).toEqual([{ role: 'system', content: 'Pick folders.' }]);
    expect(created?.expectedInputs).toEqual([
      { type: 'text', languages: builtinAIConfig.session_languages },
    ]);
    // Never a sampling option: temperature and topK are deprecated, and mixing them is a TypeError.
    expect(created).not.toHaveProperty('temperature');
    expect(created).not.toHaveProperty('topK');
    expect(created).not.toHaveProperty('monitor');

    const [prompt] = fake.prompts;
    expect(prompt?.input).toBe('Page title: Bun docs');
    expect(prompt?.options?.omitResponseConstraintInput).toBe(true);
    const constraint = prompt?.options?.responseConstraint as Record<string, unknown>;
    expect(constraint).not.toHaveProperty('$schema');
    expect(constraint).toMatchObject({
      properties: { folders: { items: { enum: ['12', '34'] }, maxItems: 2 } },
    });
    expect(fake.destroyed).toBe(1);
    expect(calls).toEqual([
      expect.objectContaining({
        input: expect.stringContaining('Pick folders.'),
        output: '{"folders":["34","12"]}',
      }),
    ]);
  });

  it('never starts a download: a call before the model is ready fails without a session', async () => {
    for (const availability of ['downloadable', 'downloading', 'unavailable'] as const) {
      const fake = installFakeLanguageModel({ availability });
      const calls: { error?: string }[] = [];
      await expect(
        generateObject({
          model: createBuiltinModel({ modelId: 'gemini-nano', onCall: (call) => calls.push(call) }),
          schema,
          prompt: 'Page title: Bun docs',
          maxRetries: 0,
        }),
      ).rejects.toThrow();
      expect(fake.creates, availability).toEqual([]);
      expect(calls[0]?.error).toBeTruthy();
    }
  });

  it('destroys the session when the prompt fails', async () => {
    const fake = installFakeLanguageModel({ answer: new Error('model crashed') });
    await expect(
      generateObject({
        model: createBuiltinModel({ modelId: 'gemini-nano' }),
        schema,
        prompt: 'Page title: Bun docs',
        maxRetries: 0,
      }),
    ).rejects.toThrow();
    expect(fake.destroyed).toBe(1);
  });

  it('logs each call in the AI activity log as an on-device request', async () => {
    await saveSettings({ aiActivityRecording: true });
    installFakeLanguageModel({ answer: '{"folders":["12"]}' });
    const model = await createAIModel(
      { enabled: true, provider: 'chrome_builtin', model: 'gemini-nano', apiKey: '' },
      'folderRecommendation',
    );
    await generateObject({ model, schema, system: 'Pick folders.', prompt: 'Page title: Bun' });
    await vi.waitFor(async () => expect(await aiActivityValue.get()).toHaveLength(1));
    const [entry] = await aiActivityValue.get();
    expect(entry).toMatchObject({
      source: 'folderRecommendation',
      provider: 'chrome_builtin',
      model: 'gemini-nano',
      method: 'ON-DEVICE',
      url: 'on-device:gemini-nano',
      responseBody: '{"folders":["12"]}',
    });
    expect(entry?.requestBody).toContain('Page title: Bun');
  });
});

describe('warm built-in sessions for AI quick save', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads the instructions once and starts each call from a copy', async () => {
    const fake = installFakeLanguageModel();
    const warm = createWarmBuiltinSessions({ idleMs: 60_000, onIdle: vi.fn() });
    await warm.open('Pick folders.', undefined);
    await warm.open('Pick folders.', undefined);
    expect(fake.creates).toHaveLength(1);
    expect(fake.creates[0]?.initialPrompts).toEqual([{ role: 'system', content: 'Pick folders.' }]);
    expect(fake.clones).toBe(2);

    // Other instructions replace the base session.
    await warm.open('Pick three folders.', undefined);
    expect(fake.creates).toHaveLength(2);
    await vi.waitFor(() => expect(fake.destroyed).toBe(1));
    warm.dispose();
  });

  it('destroys the base session after the idle time and says so', async () => {
    vi.useFakeTimers();
    const fake = installFakeLanguageModel();
    const onIdle = vi.fn();
    const warm = createWarmBuiltinSessions({ idleMs: 1000, onIdle });
    await warm.open('Pick folders.', undefined);
    await vi.advanceTimersByTimeAsync(999);
    expect(onIdle).not.toHaveBeenCalled();
    // A call restarts the idle time.
    await warm.open('Pick folders.', undefined);
    await vi.advanceTimersByTimeAsync(999);
    expect(onIdle).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onIdle).toHaveBeenCalledOnce();
    expect(fake.destroyed).toBe(1);
    // The next call loads the instructions again.
    await warm.open('Pick folders.', undefined);
    expect(fake.creates).toHaveLength(2);
    warm.dispose();
  });

  it('never creates a session, or starts a download, before the model is ready', async () => {
    const fake = installFakeLanguageModel({ availability: 'downloadable' });
    const warm = createWarmBuiltinSessions({ idleMs: 60_000, onIdle: vi.fn() });
    await expect(warm.open('Pick folders.', undefined)).rejects.toThrow(
      t('builtinAi_errorNotReady'),
    );
    expect(fake.creates).toEqual([]);
    // Once ready, the next call works.
    fake.options.availability = 'available';
    await warm.open('Pick folders.', undefined);
    expect(fake.clones).toBe(1);
    warm.dispose();
  });

  it('the adapter uses the warm session only for calls that start from the instructions', async () => {
    const fake = installFakeLanguageModel({ answer: '{"folders":["12"]}' });
    const warm = createWarmBuiltinSessions({ idleMs: 60_000, onIdle: vi.fn() });
    const model = createBuiltinModel({ modelId: 'gemini-nano', openSession: warm.open });
    const schema = z.object({ folders: z.array(z.string()) });
    for (const prompt of ['Page title: A', 'Page title: B']) {
      await generateObject({ model, schema, system: 'Pick folders.', prompt });
    }
    expect(fake.creates).toHaveLength(1);
    expect(fake.clones).toBe(2);
    // Each copy is destroyed after its call; the base stays for the next one.
    expect(fake.destroyed).toBe(2);
    warm.dispose();
  });
});

describe('folder suggestions from the built-in model', () => {
  type Spec = { id: string; title: string; url?: string; children?: Spec[] };
  /** Nodes with their parent ids, as the browser returns them; the root has none. */
  const build = (spec: Spec, parentId?: string): BookmarkTreeNode => ({
    id: spec.id,
    title: spec.title,
    ...(parentId ? { parentId } : {}),
    ...(spec.url
      ? { url: spec.url }
      : { children: (spec.children ?? []).map((child) => build(child, spec.id)) }),
  });
  const folder = (id: string, title: string, children: Spec[] = []): Spec => ({
    id,
    title,
    children,
  });
  const bookmark = (id: string, title: string, url: string): Spec => ({ id, title, url });
  // Root > Bookmarks Bar > folders; each folder holds a bookmark about its topic.
  const extra = Array.from({ length: 40 }, (_, index) =>
    folder(`extra-${index}`, `Saved ${index}`, [
      bookmark(`b-extra-${index}`, `Old note ${index}`, `https://notes.example/${index}`),
    ]),
  );
  const tree: BookmarkTreeNode[] = [
    build(
      folder('0', '', [
        folder('bar', 'Bookmarks Bar', [
          folder('rust', 'Rust', [
            bookmark('b1', 'The Rust book', 'https://doc.rust-lang.org/book'),
          ]),
          folder('bun', 'Bun', [bookmark('b2', 'Bun runtime docs', 'https://bun.sh/docs')]),
          folder('news', 'News', [bookmark('b3', 'Daily news', 'https://news.example/today')]),
          ...extra,
        ]),
      ]),
    ),
  ];
  const page = {
    title: 'Bun docs: bundler',
    url: 'https://bun.sh/docs/bundler',
    pageText: 'x'.repeat(5000),
  };

  it('shortlists at most the configured count, word matches first', () => {
    const index = buildFolderRankingIndex(tree);
    const shortlist = shortlistFolders(index, page, builtinAIConfig.folders.candidates);
    expect(shortlist).toHaveLength(builtinAIConfig.folders.candidates);
    expect(shortlist[0]?.id).toBe('bun');
    // A page that shares no word with any folder still gets shallow folders to choose from.
    const none = shortlistFolders(index, { title: 'zzz', url: 'https://zzz.invalid/' }, 3);
    expect(none.map((candidate) => candidate.id)).toHaveLength(3);
  });

  it('asks in English for ids from the shortlist, with the page text cut to the excerpt cap', () => {
    const index = buildFolderRankingIndex(tree);
    const candidates = shortlistFolders(index, page, 5);
    const request = buildBuiltinFolderRequest(page, candidates, 3);
    expect(request.system).toContain('Use up to 3 ids');
    expect(request.prompt).toContain('Page title: Bun docs: bundler');
    expect(request.prompt).toContain('bun: Bookmarks Bar/Bun');
    const text = request.prompt.split('\n').find((line) => line.startsWith('Page text: ')) ?? '';
    expect(text.length - 'Page text: '.length).toBe(builtinAIConfig.folders.page_excerpt_chars);
    expect(request.schema.safeParse({ folders: ['bun'] }).success).toBe(true);
    expect(request.schema.safeParse({ folders: ['not-listed'] }).success).toBe(false);
    expect(request.schema.safeParse({ folders: ['bun', 'rust', 'news', 'extra-1'] }).success).toBe(
      false,
    );
    // Without page text there is no page text line.
    const bare = buildBuiltinFolderRequest({ title: page.title, url: page.url }, candidates, 3);
    expect(bare.prompt).not.toContain('Page text:');
  });

  it("returns the model's picks in its order, as existing folders with their ids", async () => {
    const generate = vi.fn(async () => ({ folders: ['news', 'bun', 'bun', 'gone'] }));
    const suggestions = await recommendFoldersOnDevice(generate, page, tree, 3);
    expect(suggestions.map((suggestion) => suggestion.folderId)).toEqual(['news', 'bun']);
    expect(suggestions[0]).toMatchObject({
      type: 'existing',
      folderPath: 'Bookmarks Bar/News',
      reason: t('builtinAi_reasonModel'),
    });
    for (const suggestion of suggestions) {
      expect(suggestion.confidence).toBeGreaterThan(0);
      expect(suggestion.confidence).toBeLessThanOrEqual(builtinAIConfig.folders.max_confidence);
    }
    const [request] = generate.mock.calls[0] as unknown as [{ abortSignal: AbortSignal }];
    expect(request.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('falls back to the word match when the model fails, times out, or picks nothing', async () => {
    for (const generate of [
      async () => {
        throw new DOMException('timed out', 'TimeoutError');
      },
      async () => ({ folders: [] }),
    ]) {
      const suggestions = await recommendFoldersOnDevice(generate, page, tree, 2);
      expect(suggestions[0]).toMatchObject({
        folderId: 'bun',
        reason: t('builtinAi_reasonWordMatch'),
      });
    }
  });

  it('suggests a new top-level folder for a library without folders, without asking', async () => {
    const generate = vi.fn();
    const suggestions = await recommendFoldersOnDevice(generate, page, [build(folder('0', ''))], 3);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.type).toBe('new');
    expect(generate).not.toHaveBeenCalled();
  });
});
