/**
 * Messages of Ask AI on Pi Durable. The chat UI (popup, side panel) talks to the AI host page over
 * a port; the host page asks the background for what it cannot do itself (Chrome gives it only the
 * runtime API): each answer's setup, every action call, and keeping the chat list. Pure, so every
 * context can load it.
 */
import type { UIMessage } from 'ai';
import { z } from 'zod';
import type { SupportedLocale } from '@/hooks/use-i18n';
import type { AISettings } from '@/services/ai-client';

/** The port a chat UI opens to the AI host page. */
export const ASK_AI_PORT = 'ask-ai-chat';

export const ASK_AI_MESSAGE = {
  /** A chat UI asks the background to open the AI host page and keep it open. */
  open: 'ask-ai/open',
  /** The host page asks the background for an answer's setup. */
  setup: 'ask-ai/setup',
  /** The host page asks the background to run one action call. */
  callAction: 'ask-ai/call-action',
  /** The host page reports a chat's title, time, and whether an answer is running. */
  chat: 'ask-ai/chat',
  /** The host page reports a chat it deleted. */
  chatDeleted: 'ask-ai/chat-deleted',
  /** The background asks the host page to pick up chats a restart left running. */
  resume: 'ask-ai/resume',
  /** The background asks the host page to delete chats the chat list dropped. */
  forget: 'ask-ai/forget',
  /** The host page has no running answer and no chat UI attached, so it may close. */
  idle: 'ask-ai/idle',
} as const;

/** What a chat UI sends over the port. */
export const askAIClientMessageSchema = z.discriminatedUnion('type', [
  /** Show this chat, or a new one; a private window's chat is kept in memory only. */
  z.object({ type: z.literal('attach'), chatId: z.string().optional(), ephemeral: z.boolean() }),
  z.object({ type: z.literal('send'), text: z.string().min(1), requestId: z.string().min(1) }),
  z.object({ type: z.literal('stop') }),
  z.object({ type: z.literal('decide'), callId: z.string().min(1), approved: z.boolean() }),
  z.object({ type: z.literal('delete'), chatId: z.string().min(1) }),
  z.object({ type: z.literal('deleteAll') }),
]);
export type AskAIClientMessage = z.infer<typeof askAIClientMessageSchema>;

export type AskAIChatStatus = 'ready' | 'submitted' | 'streaming' | 'error';

/** What the host page sends a chat UI: the attached chat as the UI shows it. */
export type AskAIHostMessage =
  | {
      type: 'view';
      chatId: string;
      messages: UIMessage[];
      status: AskAIChatStatus;
      /** The failed answer's error, in the provider's words. */
      error?: string;
    }
  | { type: 'error'; message: string };

/** One action call the host page asks the background to run. */
export const askAICallActionSchema = z.object({
  type: z.literal(ASK_AI_MESSAGE.callAction),
  chatId: z.string().min(1),
  name: z.string().min(1),
  args: z.unknown(),
  untrustedContentSeen: z.boolean(),
  knownUrls: z.array(z.string()),
});

/** A chat as the chat list keeps it. */
export const askAIChatUpdateSchema = z.object({
  type: z.literal(ASK_AI_MESSAGE.chat),
  chatId: z.string().min(1),
  title: z.string(),
  updatedAt: z.number(),
  running: z.boolean(),
});

export const askAIChatDeletedSchema = z.object({
  type: z.literal(ASK_AI_MESSAGE.chatDeleted),
  chatId: z.string().min(1),
});

/** The background's answer to `setup`: everything one answer needs from the settings. */
export type AskAIHostSetup =
  | {
      ok: true;
      /** The default AI service, with its key, for the host page's model. */
      settings: AISettings;
      /** Logs this chat's provider requests under Ask AI (`aiHostCallFetch`). */
      token: string;
      /** The extension's language, for errors the host page describes. */
      locale: SupportedLocale;
      system: string;
      tools: string[];
      maxSteps: number;
      webSearch: boolean;
      webSearchMaxUses: number;
      /** The user's own skills and the skills turned off (Options > AI > Skills). */
      skills: { user: UserSkill[]; disabled: string[] };
    }
  | { ok: false; error: string };
