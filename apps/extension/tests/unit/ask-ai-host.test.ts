import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { ASK_AI_MESSAGE, ASK_AI_PORT, type AskAIHostMessage } from '@/lib/ask-ai-protocol';
import { createAIModel } from '@/services/ai-client.lazy';
import { handleBackgroundMessage, serve } from '@/services/ask-ai-host.lazy';
import { type FakePort, portPair } from './fake-port';
import { finishPart, scriptedStreamModel, textParts, toolCallPart } from './scripted-stream-model';

vi.mock('@/services/ai-client.lazy', () => ({ createAIModel: vi.fn() }));

type View = Extract<AskAIHostMessage, { type: 'view' }>;

const sender = { id: fakeBrowser.runtime.id, url: fakeBrowser.runtime.getURL('/popup.html') };
const setup = {
  ok: true,
  settings: {
    enabled: true,
    provider: 'custom',
    model: 'm',
    apiKey: '',
    baseUrl: 'https://p.invalid/v1',
  },
  token: 't',
  locale: 'en',
  system: 'You are Ask AI.',
  tools: ['listFolders', 'applyChanges'],
  maxSteps: 4,
  webSearch: false,
  webSearchMaxUses: 1,
};

let messages: { type: string; [key: string]: unknown }[] = [];
let open: FakePort[] = [];

beforeEach(() => {
  fakeBrowser.reset();
  setLanguage('en');
  messages = [];
  open = [];
  // Chrome and Firefox have Web Locks; the test page gets a lock that is always free.
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: async (_name: string, task: () => Promise<void>) => task() },
  });
  vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockImplementation(async (message: unknown) => {
    const typed = message as { type: string; name?: string; checkOnly?: true };
    messages.push(typed);
    if (typed.type === ASK_AI_MESSAGE.setup) return setup;
    if (typed.type === ASK_AI_MESSAGE.callAction) {
      return typed.checkOnly ? null : { ok: true, ran: typed.name };
    }
    return undefined;
  });
});

afterEach(async () => {
  for (const port of open) port.disconnect();
  await vi.waitFor(() => expect(messages.some((m) => m.type === ASK_AI_MESSAGE.idle)).toBe(true));
});

/** A chat UI attached to the host page, with the views it received. */
function attach(answers: Parameters<typeof scriptedStreamModel>[0], chat: object) {
  const { model, calls } = scriptedStreamModel(answers);
  vi.mocked(createAIModel).mockResolvedValue(model as never);
  const [client, server] = portPair(ASK_AI_PORT, sender);
  open.push(client);
  const views: View[] = [];
  client.onMessage.addListener((message) => {
    if ((message as AskAIHostMessage).type === 'view') views.push(message as View);
  });
  serve(server, [{ type: 'attach', ...chat }]);
  const latest = () => views.at(-1);
  return { client, views, latest, calls };
}

describe('Ask AI in the AI host page', () => {
  it('answers a chat kept in memory, and lists nothing for a private window', async () => {
    const { client, latest } = attach([[...textParts('Hi there'), finishPart('stop')]], {
      ephemeral: true,
    });
    await vi.waitFor(() => expect(latest()?.status).toBe('ready'));
    client.postMessage({ type: 'send', text: 'Hello', requestId: 'r1' });
    await vi.waitFor(() =>
      expect(latest()?.messages.at(-1)?.parts).toEqual([
        { type: 'text', text: 'Hi there', state: 'done' },
      ]),
    );
    expect(latest()?.status).toBe('ready');
    expect(messages.some((m) => m.type === ASK_AI_MESSAGE.chat)).toBe(false);
  });

  it('keeps a chat in its database, holds a change for approval, runs it once approved, and deletes it', async () => {
    const { client, latest, calls } = attach(
      [
        [toolCallPart('applyChanges', { planId: 'p1' }), finishPart('tool-calls')],
        [...textParts('Done'), finishPart('stop')],
      ],
      { ephemeral: false },
    );
    await vi.waitFor(() => expect(latest()).toBeDefined());
    const chatId = latest()?.chatId as string;
    client.postMessage({ type: 'send', text: 'Apply it', requestId: 'r1' });
    await vi.waitFor(() =>
      expect(latest()?.messages.at(-1)?.parts.at(-1)).toMatchObject({
        state: 'approval-requested',
        approval: { id: 'call-applyChanges' },
      }),
    );
    // Only checked, so nobody approves a call that cannot work; nothing ran yet.
    expect(messages.filter((m) => m.type === ASK_AI_MESSAGE.callAction)).toEqual([
      expect.objectContaining({ name: 'applyChanges', checkOnly: true }),
    ]);
    // The chat list hears about it, named by its first question.
    expect(messages).toContainEqual(
      expect.objectContaining({ type: ASK_AI_MESSAGE.chat, chatId, title: 'Apply it' }),
    );

    client.postMessage({ type: 'decide', callId: 'call-applyChanges', approved: true });
    await vi.waitFor(() =>
      expect(latest()?.messages.at(-1)?.parts.at(-1)).toMatchObject({ text: 'Done' }),
    );
    expect(messages.filter((m) => m.type === ASK_AI_MESSAGE.callAction && !m.checkOnly)).toEqual([
      expect.objectContaining({ name: 'applyChanges', args: { planId: 'p1' }, chatId }),
    ]);
    expect(calls).toHaveLength(2);
    expect(messages).toContainEqual(
      expect.objectContaining({ type: ASK_AI_MESSAGE.chat, chatId, running: false }),
    );

    client.postMessage({ type: 'delete', chatId });
    await vi.waitFor(() =>
      expect(messages).toContainEqual({ type: ASK_AI_MESSAGE.chatDeleted, chatId }),
    );
    const names = (await indexedDB.databases()).map((database) => database.name);
    expect(names.some((name) => name?.endsWith(chatId))).toBe(false);
  });

  it('reopens a kept chat, and forgets the chats the background drops', async () => {
    const first = attach([[...textParts('First answer'), finishPart('stop')]], {
      ephemeral: false,
    });
    await vi.waitFor(() => expect(first.latest()).toBeDefined());
    const chatId = first.latest()?.chatId as string;
    first.client.postMessage({ type: 'send', text: 'Question', requestId: 'r1' });
    await vi.waitFor(() => expect(first.latest()?.messages).toHaveLength(2));
    first.client.disconnect();

    const again = attach([], { chatId, ephemeral: false });
    await vi.waitFor(() =>
      expect(again.latest()?.messages.map((message) => message.role)).toEqual([
        'user',
        'assistant',
      ]),
    );
    handleBackgroundMessage({ type: ASK_AI_MESSAGE.forget, chatIds: [chatId] });
    await vi.waitFor(() =>
      expect(messages).toContainEqual({ type: ASK_AI_MESSAGE.chatDeleted, chatId }),
    );
  });

  it('says why an answer could not start', async () => {
    vi.mocked(fakeBrowser.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const typed = message as { type: string };
      messages.push(typed);
      return typed.type === ASK_AI_MESSAGE.setup
        ? { ok: false, error: 'Add an AI service' }
        : undefined;
    });
    const { client } = attach([], { ephemeral: true });
    const errors: string[] = [];
    client.onMessage.addListener((message) => {
      if ((message as AskAIHostMessage).type === 'error')
        errors.push((message as { message: string }).message);
    });
    client.postMessage({ type: 'send', text: 'Hello', requestId: 'r1' });
    await vi.waitFor(() => expect(errors).toEqual(['Add an AI service']));
  });
});
