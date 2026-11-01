import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { askAiChatsValue, chatTitle, clearChats, deleteChat, keepChat } from '@/lib/ask-ai-chats';

const ask = (id: string, text: string): UIMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
});

beforeEach(() => {
  fakeBrowser.reset();
});

describe('Ask AI kept chats', () => {
  it('keeps chats newest first, named by the first question, at most the setting', async () => {
    await keepChat('a', [ask('1', 'First   question\nhere')], 2);
    await keepChat('b', [ask('2', 'Second')], 2);
    await keepChat('c', [ask('3', 'Third')], 2);
    const chats = await askAiChatsValue.get();
    expect(chats.map((chat) => chat.id)).toEqual(['c', 'b']);
    expect(chatTitle([ask('1', 'First   question\nhere')])).toBe('First question here');
    // Keeping a chat again moves it to the front instead of adding a copy.
    await keepChat('b', [ask('2', 'Second'), ask('4', 'More')], 2);
    expect((await askAiChatsValue.get()).map((chat) => chat.id)).toEqual(['b', 'c']);
  });

  it('keeps a change still waiting for approval as declined', async () => {
    const waiting = {
      id: 'm',
      role: 'assistant',
      parts: [
        {
          type: 'tool-applyChanges',
          toolCallId: 't',
          state: 'approval-requested',
          input: {},
          approval: { id: 'approve-1' },
        },
      ],
    } as unknown as UIMessage;
    await keepChat('a', [ask('1', 'Move it'), waiting], 5);
    const [chat] = await askAiChatsValue.get();
    expect(chat.messages[1].parts[0]).toMatchObject({
      state: 'output-denied',
      approval: { id: 'approve-1', approved: false },
    });
  });

  it('keeps an answer still being written as finished text, without tool steps that have no result', async () => {
    const writing = {
      id: 'm',
      role: 'assistant',
      parts: [
        {
          type: 'tool-listFolders',
          toolCallId: 'a',
          state: 'output-available',
          input: {},
          output: [],
        },
        { type: 'tool-findBookmarks', toolCallId: 'b', state: 'input-streaming', input: {} },
        { type: 'tool-listFolders', toolCallId: 'c', state: 'input-available', input: {} },
        {
          type: 'tool-applyChanges',
          toolCallId: 'd',
          state: 'approval-responded',
          input: {},
          approval: { id: 'approve-2', approved: true },
        },
        { type: 'text', text: 'Half an ans', state: 'streaming' },
      ],
    } as unknown as UIMessage;
    await keepChat('a', [ask('1', 'Tidy up'), writing], 5);
    const [chat] = await askAiChatsValue.get();
    expect(chat.messages[1].parts).toEqual([
      expect.objectContaining({ toolCallId: 'a', state: 'output-available' }),
      { type: 'text', text: 'Half an ans', state: 'done' },
    ]);
  });

  it('deletes one chat or all of them', async () => {
    await keepChat('a', [ask('1', 'One')], 5);
    await keepChat('b', [ask('2', 'Two')], 5);
    await deleteChat('a');
    expect((await askAiChatsValue.get()).map((chat) => chat.id)).toEqual(['b']);
    await clearChats();
    expect(await askAiChatsValue.get()).toEqual([]);
  });
});
