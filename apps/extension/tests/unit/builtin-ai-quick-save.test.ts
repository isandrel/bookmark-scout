/**
 * AI quick save with Chrome's built-in AI: the AI host page's side (a warm session copied per
 * call, the answer limited to the shortlist, each call reported to the background for the AI
 * activity log), and the background's (the model's pick saved, or, when the model is not ready,
 * fails, or picks nothing, the local word match, without ever starting a download). The AI host
 * page itself is replaced by a fake `withAIHost`; the offscreen document is not reachable here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { addAIService } from '@/lib/ai-services-storage';
import { QUICK_SAVE_MESSAGE, type QuickSaveHostRequest } from '@/lib/quick-save-protocol';
import { saveSettings } from '@/lib/settings-storage';
import { runQuickSave } from '@/services/quick-save';
import { type AIHostSession, withAIHost } from '@/services/quick-save-ai-host';
import { handleAIHostRequest } from '@/services/quick-save-ai-runner';
import { type FakeBookmarks, installFakeBookmarks } from '../fake-bookmarks';
import { installFakeLanguageModel } from './fake-language-model';

vi.mock('@/services/quick-save-ai-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/quick-save-ai-host')>()),
  withAIHost: vi.fn(),
}));

const builtin = { enabled: true, provider: 'chrome_builtin', model: 'gemini-nano', apiKey: '' };

const tab = (url: string, title: string) =>
  ({ id: 7, index: 0, windowId: 1, url, title, active: true }) as Browser.tabs.Tab;

let bookmarks: FakeBookmarks;

beforeEach(async () => {
  fakeBrowser.reset();
  vi.mocked(withAIHost).mockReset();
  bookmarks = installFakeBookmarks([
    { id: 'bar', title: 'Bookmarks Bar' },
    { id: 'other', title: 'Other Bookmarks' },
    { id: 'reading', parentId: 'other', title: 'Reading' },
    { id: 'dev', parentId: 'bar', title: 'Dev' },
    { id: 'react', parentId: 'dev', title: 'React' },
    { id: 'r1', parentId: 'react', title: 'Hooks reference', url: 'https://react.dev/reference' },
    { id: 'cooking', parentId: 'bar', title: 'Cooking' },
    { id: 'c1', parentId: 'cooking', title: 'Pasta recipe', url: 'https://food.example/pasta' },
  ]);
  await saveSettings({ language: 'en', aiEnabled: true, aiMaxRecommendations: 2 });
  setLanguage('en');
  await addAIService('chrome_builtin');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A fake AI host page whose model answers `folders`; records each generate request. */
function fakeHost(answer: () => Promise<{ folders: string[] }>) {
  const requests: Parameters<AIHostSession['generate']>[0][] = [];
  vi.mocked(withAIHost).mockImplementation(async (_settings, _options, work) =>
    work({
      readPage: async () => null,
      generate: (async (request) => {
        requests.push(request);
        return answer();
      }) as AIHostSession['generate'],
    }),
  );
  return requests;
}

describe('[mocked provider contract] AI quick save with the built-in model', () => {
  it("saves into the model's pick from the shortlist, keeping the host page warm", async () => {
    installFakeLanguageModel({ availability: 'available' });
    const requests = fakeHost(async () => ({ folders: ['cooking'] }));

    const record = await runQuickSave('ai-quick-save', tab('https://react.dev/learn', 'React'));
    expect(record).toMatchObject({ status: 'saved', folderId: 'cooking', mode: 'ai' });
    expect(bookmarks.get(record.bookmarkId ?? '')).toMatchObject({ parentId: 'cooking' });
    const [, options] = vi.mocked(withAIHost).mock.calls[0] ?? [];
    expect(options).toMatchObject({ source: 'folderRecommendation', keepOpen: true });
    expect(requests[0]).toMatchObject({ schema: 'folderIds', maxChoices: 2 });
    expect(requests[0]?.choices).toEqual(expect.arrayContaining(['react', 'cooking']));
  });

  it('saves by the word match when the model is not downloaded, without opening the host page', async () => {
    for (const availability of ['downloadable', 'downloading', 'unavailable'] as const) {
      const fake = installFakeLanguageModel({ availability });
      fakeHost(async () => ({ folders: ['cooking'] }));
      const record = await runQuickSave(
        'ai-quick-save',
        tab(`https://react.dev/${availability}`, 'Quick Start – React'),
      );
      expect(record, availability).toMatchObject({ status: 'saved', folderId: 'react' });
      expect(withAIHost).not.toHaveBeenCalled();
      expect(fake.creates).toEqual([]);
    }
  });

  it('saves by the word match when the model fails, times out, or picks nothing', async () => {
    installFakeLanguageModel({ availability: 'available' });
    const answers = {
      crashed: async () => {
        throw new Error('model crashed');
      },
      timeout: async () => {
        throw new DOMException('timed out', 'TimeoutError');
      },
      nothing: async () => ({ folders: [] }),
    };
    for (const [name, answer] of Object.entries(answers)) {
      fakeHost(answer);
      const page = tab(`https://react.dev/${name}`, 'Quick Start – React');
      const record = await runQuickSave('ai-quick-save', page);
      expect(record, name).toMatchObject({ status: 'saved', folderId: 'react' });
    }
  });
});

describe('[mocked provider contract] the AI host page with the built-in model', () => {
  const request = (
    overrides: Partial<Extract<QuickSaveHostRequest, { schema: string }>> = {},
  ): QuickSaveHostRequest => ({
    type: QUICK_SAVE_MESSAGE.hostGenerate,
    token: 'call-1',
    settings: builtin,
    source: 'folderRecommendation',
    locale: 'en',
    schema: 'folderIds',
    choices: ['react', 'cooking'],
    maxChoices: 2,
    system: 'Pick folders.',
    prompt: 'Page title: React',
    ...overrides,
  });

  it('answers from a copy of one warm session and reports each call to the background', async () => {
    const fake = installFakeLanguageModel({ answer: '{"folders":["react"]}' });
    const sendMessage = vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(undefined);

    await expect(handleAIHostRequest(request())).resolves.toEqual({
      ok: true,
      object: { folders: ['react'] },
    });
    await handleAIHostRequest(request({ prompt: 'Page title: React hooks' }));
    expect(fake.creates).toHaveLength(1);
    expect(fake.clones).toBe(2);
    expect(fake.prompts[0]?.options?.responseConstraint).toMatchObject({
      properties: { folders: { items: { enum: ['react', 'cooking'] }, maxItems: 2 } },
    });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: QUICK_SAVE_MESSAGE.hostActivity,
        token: 'call-1',
        output: '{"folders":["react"]}',
      }),
    );
  });

  it('refuses a folder id answer without its choices', async () => {
    installFakeLanguageModel();
    const { choices: _ignored, ...withoutChoices } = request() as Extract<
      QuickSaveHostRequest,
      { schema: string }
    >;
    await expect(handleAIHostRequest(withoutChoices)).resolves.toMatchObject({ ok: false });
  });
});
