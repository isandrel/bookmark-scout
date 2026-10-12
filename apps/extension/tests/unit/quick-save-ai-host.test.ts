import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { aiActivityValue } from '@/lib/ai-activity-storage';
import { QUICK_SAVE_MESSAGE } from '@/lib/quick-save-protocol';
import { saveSettings } from '@/lib/settings-storage';
import type { AISettings } from '@/services/ai-client';
import { AI_HOST_PATH, forwardAIHostFetch, withAIHost } from '@/services/quick-save-ai-host';

const settings: AISettings = {
  enabled: true,
  provider: 'custom',
  model: 'synthetic-model',
  apiKey: '',
  baseUrl: 'https://provider.invalid/v1',
};

const hostSender = () => ({
  id: fakeBrowser.runtime.id,
  url: fakeBrowser.runtime.getURL(AI_HOST_PATH),
});

beforeEach(async () => {
  fakeBrowser.reset();
  await saveSettings({ aiActivityRecording: true });
  // Chrome's offscreen document; the fake browser has none.
  Object.assign(fakeBrowser, {
    offscreen: {
      createDocument: vi.fn(async () => undefined),
      closeDocument: vi.fn(async () => undefined),
    },
  });
  vi.spyOn(fakeBrowser.runtime, 'getContexts').mockResolvedValue([]);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{"ok":true}', { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(fakeBrowser, 'offscreen');
});

describe('AI host page requests', () => {
  it("logs each provider request under its call's source, not always as folder suggestions", async () => {
    let tokenSeen = '';
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockImplementation(async (message: unknown) => {
      tokenSeen = (message as { token: string }).token;
      return { ok: true, object: { recommendations: [] } };
    });

    await withAIHost(settings, { locale: 'en', source: 'askAI' }, async (host) => {
      await host.generate({ schema: 'folderRecommendations', system: 's', prompt: 'p' });
      const forwarded = await forwardAIHostFetch(
        {
          type: QUICK_SAVE_MESSAGE.hostFetch,
          token: tokenSeen,
          url: 'https://provider.invalid/v1/chat/completions',
          method: 'POST',
          headers: [],
          body: '{}',
        },
        hostSender(),
      );
      expect(forwarded).toMatchObject({ ok: true, status: 200 });
    });

    await vi.waitFor(async () => expect(await aiActivityValue.get()).toHaveLength(1));
    expect((await aiActivityValue.get())[0]).toMatchObject({
      source: 'askAI',
      provider: 'custom',
      model: 'synthetic-model',
    });
  });

  it('refuses a provider request outside an AI call or from another sender', async () => {
    const message = {
      type: QUICK_SAVE_MESSAGE.hostFetch,
      token: 'not-a-call',
      url: 'https://provider.invalid/v1/chat/completions',
      method: 'POST',
      headers: [],
    };
    await expect(forwardAIHostFetch(message, hostSender())).resolves.toMatchObject({ ok: false });
    await expect(
      forwardAIHostFetch(message, { id: fakeBrowser.runtime.id, url: 'https://e2e.invalid/' }),
    ).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
