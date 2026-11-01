/**
 * Ask AI's chat list: one entry per chat, newest first, at most the user's Chats Kept, with its
 * name (the first question), when it last changed, and whether an answer is still running, so a
 * restart picks that chat up. The conversations themselves are kept by Pi Durable, one IndexedDB
 * database per chat (`services/ask-ai-host.lazy.ts`), so deleting a chat deletes all of it. The
 * background writes the list; Chrome gives the AI host page no storage.
 */
import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';

const chatConfig = readConfig(
  'ai/chat-history',
  z.strictObject({ title_chars: boundedNumber({ integer: true }) }),
);

export type AskAIChat = {
  id: string;
  /** The first question, cut to `title_chars`. */
  title: string;
  updatedAt: number;
  /** An answer is running, or waits to pick up after a restart. */
  running: boolean;
};

const chatSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  updatedAt: z.number(),
  running: z.boolean(),
});

/** Newest first; a malformed entry is dropped on its own. */
export const askAiChatsValue = defineStoredValue<AskAIChat[]>(STORAGE_ITEMS.askAiChats, {
  parse: (raw) => parseValidList(raw, chatSchema),
  empty: [],
  isEmpty: (chats) => chats.length === 0,
});

/** A chat's name in the list, from its first question. */
export function chatTitle(question: string): string {
  return truncateText(question.replace(/\s+/gu, ' ').trim(), chatConfig.title_chars);
}

/**
 * Records a chat, newest first, keeping at most `max`; returns the ids it dropped, whose
 * conversations the host page deletes. A running chat is never dropped.
 */
export async function recordChat(chat: AskAIChat, max: number): Promise<string[]> {
  let dropped: string[] = [];
  await askAiChatsValue.update((chats) => {
    const next = [chat, ...chats.filter((other) => other.id !== chat.id)];
    const keep = next.filter((entry, index) => index < max || entry.running);
    dropped = next.filter((entry) => !keep.includes(entry)).map((entry) => entry.id);
    return keep;
  });
  return dropped;
}

export function removeChat(id: string): Promise<AskAIChat[]> {
  return askAiChatsValue.update((chats) => chats.filter((chat) => chat.id !== id));
}
