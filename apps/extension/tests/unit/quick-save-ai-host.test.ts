import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { aiActivityValue } from '@/lib/ai-activity-storage';
import { QUICK_SAVE_MESSAGE } from '@/lib/quick-save-protocol';
import { saveSettings } from '@/lib/settings-storage';
import type { AISettings } from '@/services/ai-client';
import {
  AI_HOST_PATH,
  type AIHostSession,
  closeIdleAIHost,
  forwardAIHostFetch,
  recordAIHostActivity,
  withAIHost,
} from '@/services/quick-save-ai-host';

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

describe('one AI host page shared by a quick save and a background task (J57)', () => {
  it('opens the page once, keeps it while either still uses it, and closes it after the last', async () => {
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue({
      ok: true,
      head: { title: 'T' },
    });
    const offscreen = (
      fakeBrowser as unknown as { offscreen: { createDocument: Mock; closeDocument: Mock } }
    ).offscreen;
    // The background task's slice holds the page while it reads heads.
    let finishSlice = () => {};
    const sliceDone = new Promise<void>((resolve) => {
      finishSlice = resolve;
    });
    const slice = withAIHost(null, { locale: 'en' }, async (host) => {
      await host.readHead('<title>A</title>', false);
      await sliceDone;
      return host.readHead('<title>B</title>', false);
    });
    await vi.waitFor(() => expect(offscreen.createDocument).toHaveBeenCalledOnce());

    // A quick save comes and goes meanwhile; the page stays for the task.
    await withAIHost(
      settings,
      { locale: 'en', source: 'folderRecommendation' },
      async () => undefined,
    );
    expect(offscreen.closeDocument).not.toHaveBeenCalled();

    finishSlice();
    expect(await slice).toEqual({ title: 'T' });
    expect(offscreen.createDocument).toHaveBeenCalledOnce();
    expect(offscreen.closeDocument).toHaveBeenCalledOnce();
  });
});

describe("the built-in model's warm AI host page", () => {
  const builtin: AISettings = {
    enabled: true,
    provider: 'chrome_builtin',
    model: 'gemini-nano',
    apiKey: '',
  };
  const otherSender = () => ({ id: fakeBrowser.runtime.id, url: 'https://e2e.invalid/' });
  const pickOne = (host: AIHostSession) =>
    host.generate({ schema: 'folderIds', choices: ['1'], maxChoices: 1, system: 's', prompt: 'p' });

  it('stays open after a built-in call and closes when the page reports its session idle', async () => {
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue({
      ok: true,
      object: { folders: [] },
    });
    const offscreen = (fakeBrowser as unknown as { offscreen: { closeDocument: Mock } }).offscreen;

    await withAIHost(
      builtin,
      { locale: 'en', source: 'folderRecommendation', keepOpen: true },
      pickOne,
    );
    expect(offscreen.closeDocument).not.toHaveBeenCalled();
    // A hosted call meanwhile does not close it either.
    await withAIHost(settings, { locale: 'en', source: 'askAI' }, async () => undefined);
    expect(offscreen.closeDocument).not.toHaveBeenCalled();

    // Only the host page itself may close it.
    const idle = { type: QUICK_SAVE_MESSAGE.hostIdle };
    await closeIdleAIHost(idle, otherSender());
    expect(offscreen.closeDocument).not.toHaveBeenCalled();
    await closeIdleAIHost(idle, hostSender());
    expect(offscreen.closeDocument).toHaveBeenCalledOnce();
  });

  it("records the page's built-in calls under the call's service, only during that call", async () => {
    let token = '';
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockImplementation(async (message: unknown) => {
      token = (message as { token: string }).token;
      return { ok: true, object: { folders: ['1'] } };
    });
    const entry = (callToken: string) => ({
      type: QUICK_SAVE_MESSAGE.hostActivity,
      token: callToken,
      input: 'system: Pick folders.\n\nuser: Page title: Bun',
      output: '{"folders":["1"]}',
      durationMs: 12,
    });

    await withAIHost(
      builtin,
      { locale: 'en', source: 'folderRecommendation', keepOpen: true },
      async (host) => {
        await pickOne(host);
        // From another sender, or for no call in progress, nothing is recorded.
        await recordAIHostActivity(entry(token), otherSender());
        await recordAIHostActivity(entry('not-a-call'), hostSender());
        await recordAIHostActivity(entry(token), hostSender());
      },
    );

    const log = await aiActivityValue.get();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      source: 'folderRecommendation',
      provider: 'chrome_builtin',
      model: 'gemini-nano',
      method: 'ON-DEVICE',
      responseBody: '{"folders":["1"]}',
      durationMs: 12,
    });
  });
});
