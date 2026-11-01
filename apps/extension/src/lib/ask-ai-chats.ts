/**
 * Ask AI's kept chats (Settings > AI > Ask AI > Keep Chats): on this device only, newest first, at
 * most the user's Chats Kept, each with at most `max_messages` messages. A chat is named by its
 * first question. A change that was waiting for approval when a chat was kept is kept as declined,
 * so reopening a chat never offers to apply an old plan.
 */
import type { UIMessage } from 'ai';
import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';

const chatConfig = readConfig(
  'ai/chat-history',
  z.strictObject({
    title_chars: boundedNumber({ integer: true }),
    max_messages: boundedNumber({ integer: true }),
  }),
);

export type AskAIChat = {
  id: string;
  /** The first question, cut to `title_chars`. */
  title: string;
  updatedAt: number;
  messages: UIMessage[];
};

const messageSchema = z.looseObject({
  id: z.string(),
  role: z.enum(['system', 'user', 'assistant']),
  parts: z.array(z.looseObject({ type: z.string() })),
});

const chatSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  updatedAt: z.number(),
  messages: z.array(messageSchema),
});

/** Newest first; a malformed chat is dropped on its own. */
export const askAiChatsValue = defineStoredValue<AskAIChat[]>(STORAGE_ITEMS.askAiChats, {
  parse: (raw) => parseValidList(raw, chatSchema) as AskAIChat[],
  empty: [],
  isEmpty: (chats) => chats.length === 0,
});

/** The chat's first question, as its name in the list. */
export function chatTitle(messages: readonly UIMessage[]): string {
  const first = messages.find((message) => message.role === 'user');
  const text = (first?.parts ?? [])
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return truncateText(text, chatConfig.title_chars);
}

/** A tool call still waiting for the user\'s approval, kept as declined. */
function settled(message: UIMessage): UIMessage {
  return {
    ...message,
    parts: message.parts.map((part) => {
      if (!('state' in part) || part.state !== 'approval-requested' || !('approval' in part)) {
        return part;
      }
      return { ...part, state: 'output-denied', approval: { ...part.approval, approved: false } };
    }) as UIMessage['parts'],
  };
}

/** Keeps `messages` as chat `id`, newest first, at most `max` chats. */
export async function keepChat(id: string, messages: readonly UIMessage[], max: number) {
  if (messages.length === 0) return;
  const kept = messages.slice(-chatConfig.max_messages).map(settled);
  const chat: AskAIChat = {
    id,
    title: chatTitle(messages),
    updatedAt: Date.now(),
    messages: kept,
  };
  await askAiChatsValue.update((chats) =>
    [chat, ...chats.filter((other) => other.id !== id)].slice(0, max),
  );
}

export function deleteChat(id: string): Promise<AskAIChat[]> {
  return askAiChatsValue.update((chats) => chats.filter((chat) => chat.id !== id));
}

export function clearChats(): Promise<void> {
  return askAiChatsValue.clear();
}
