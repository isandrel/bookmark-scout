import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { askAiChatsValue, recordChat } from '@/lib/ask-ai-chats';
import { ASK_AI_MESSAGE } from '@/lib/ask-ai-protocol';
import { saveSettings } from '@/lib/settings-storage';
import { AI_HOST_FETCH_PORT } from '@/services/ai-host-stream-fetch';
import { registerAskAI } from '@/services/ask-ai-background';
import { holdAIHost, releaseAIHost } from '@/services/quick-save-ai-host';
import { installFakeBookmarks } from '../fake-bookmarks';
import { portPair } from './fake-port';

vi.mock('@/services/quick-save-ai-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/quick-save-ai-host')>()),
  holdAIHost: vi.fn(async () => undefined),
  releaseAIHost: vi.fn(async () => undefined),
}));

const host = { id: fakeBrowser.runtime.id, url: fakeBrowser.runtime.getURL('/ai-host.html') };
const popup = { id: fakeBrowser.runtime.id, url: fakeBrowser.runtime.getURL('/popup.html') };
const NO_ANSWER = 'no answer';
const NO_ANSWER_MS = 200;
/** The answer a handler sends back with `sendResponse`, or NO_ANSWER when none comes. */
const send = (message: object, sender: object) =>
  new Promise<unknown>((resolve) => {
    setTimeout(() => resolve(NO_ANSWER), NO_ANSWER_MS);
    void fakeBrowser.runtime.onMessage.trigger(message, sender, resolve);
  });

let connectListener: ((port: Browser.runtime.Port) => void) | undefined;

beforeEach(async () => {
  fakeBrowser.reset();
  connectListener = undefined;
  vi.spyOn(fakeBrowser.runtime.onConnect, 'addListener').mockImplementation((listener) => {
    connectListener = listener as typeof connectListener;
  });
  vi.mocked(holdAIHost).mockClear();
  vi.mocked(releaseAIHost).mockClear();
  await saveSettings({ language: 'en', aiEnabled: true });
  setLanguage('en');
  installFakeBookmarks([
    { id: 'bar', title: 'Bookmarks Bar' },
    { id: 'work', parentId: 'bar', title: 'Work' },
  ]);
});

describe('the background side of Ask AI', () => {
  it('opens the host page for an extension page and lets it close when the page is idle', async () => {
    registerAskAI();
    expect(await send({ type: ASK_AI_MESSAGE.open }, popup)).toEqual({ ok: true });
    expect(holdAIHost).toHaveBeenCalledWith('ask-ai');
    // A web page cannot open it.
    await send(
      { type: ASK_AI_MESSAGE.open },
      { id: fakeBrowser.runtime.id, url: 'https://evil.example/' },
    );
    expect(holdAIHost).toHaveBeenCalledTimes(1);
    await send({ type: ASK_AI_MESSAGE.idle }, host);
    expect(releaseAIHost).toHaveBeenCalledWith('ask-ai');
  });

  it('runs an action call from the host page, and none from anywhere else', async () => {
    registerAskAI();
    const call = {
      type: ASK_AI_MESSAGE.callAction,
      chatId: 'c1',
      name: 'listFolders',
      args: {},
      untrustedContentSeen: false,
      knownUrls: [],
    };
    const result = await send(call, host);
    expect(JSON.stringify(result)).toContain('Bookmarks Bar/Work');
    expect(await send(call, popup)).toBe(NO_ANSWER);
    const malformed = await send({ ...call, name: '' }, host);
    expect(malformed).toMatchObject({ error: { code: 'invalid_input' } });
  });

  it('keeps the chat list the host page reports, and asks it to forget chats the list dropped', async () => {
    await saveSettings({ askAiChatsMax: 1 });
    const sent = vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(undefined);
    registerAskAI();
    const report = (chatId: string) =>
      send(
        { type: ASK_AI_MESSAGE.chat, chatId, title: chatId, updatedAt: 1, running: false },
        host,
      );
    await report('a');
    await report('b');
    await vi.waitFor(async () =>
      expect((await askAiChatsValue.get()).map((chat) => chat.id)).toEqual(['b']),
    );
    expect(sent).toHaveBeenCalledWith({ type: ASK_AI_MESSAGE.forget, chatIds: ['a'] });
    await send({ type: ASK_AI_MESSAGE.chatDeleted, chatId: 'b' }, host);
    await vi.waitFor(async () => expect(await askAiChatsValue.get()).toEqual([]));
  });

  it('reopens the host page after a restart to pick up running chats', async () => {
    await recordChat({ id: 'running', title: 'R', updatedAt: 1, running: true }, 5);
    await recordChat({ id: 'done', title: 'D', updatedAt: 1, running: false }, 5);
    const sent = vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(undefined);
    registerAskAI();
    await vi.waitFor(() =>
      expect(sent).toHaveBeenCalledWith({ type: ASK_AI_MESSAGE.resume, chatIds: ['running'] }),
    );
    expect(holdAIHost).toHaveBeenCalledWith('ask-ai');
  });

  it('serves streaming request ports from the host page, and from no other page', async () => {
    registerAskAI();
    const [, fromHost] = portPair(AI_HOST_FETCH_PORT, host);
    const listened = vi.spyOn(fromHost.onMessage, 'addListener');
    connectListener?.(fromHost);
    expect(listened).toHaveBeenCalled();
    const [, fromPopup] = portPair(AI_HOST_FETCH_PORT, popup);
    const ignored = vi.spyOn(fromPopup.onMessage, 'addListener');
    connectListener?.(fromPopup);
    expect(ignored).not.toHaveBeenCalled();
  });

  it('sets up an answer only for the host page', async () => {
    registerAskAI();
    // No AI service is set up in this test, so it says what to fix.
    expect(await send({ type: ASK_AI_MESSAGE.setup, chatId: 'c1' }, host)).toMatchObject({
      ok: false,
    });
    expect(await send({ type: ASK_AI_MESSAGE.setup, chatId: 'c1' }, popup)).toBe(NO_ANSWER);
  });
});
