import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { askAiChatsValue, chatTitle, recordChat, removeChat } from '@/lib/ask-ai-chats';

const chat = (id: string, running = false) => ({ id, title: id, updatedAt: 1, running });

beforeEach(() => {
  fakeBrowser.reset();
});

describe('Ask AI chat list', () => {
  it('keeps chats newest first, at most the setting, and returns the ones it dropped', async () => {
    expect(await recordChat(chat('a'), 2)).toEqual([]);
    expect(await recordChat(chat('b'), 2)).toEqual([]);
    expect(await recordChat(chat('c'), 2)).toEqual(['a']);
    expect((await askAiChatsValue.get()).map((entry) => entry.id)).toEqual(['c', 'b']);
    // Recording a chat again moves it to the front instead of adding a copy.
    await recordChat(chat('b'), 2);
    expect((await askAiChatsValue.get()).map((entry) => entry.id)).toEqual(['b', 'c']);
  });

  it('never drops a chat whose answer is running', async () => {
    await recordChat(chat('a', true), 1);
    expect(await recordChat(chat('b'), 1)).toEqual([]);
    expect((await askAiChatsValue.get()).map((entry) => entry.id)).toEqual(['b', 'a']);
  });

  it('names a chat by its first question, and removes one', async () => {
    expect(chatTitle('First   question\nhere')).toBe('First question here');
    await recordChat(chat('a'), 5);
    await removeChat('a');
    expect(await askAiChatsValue.get()).toEqual([]);
  });
});
