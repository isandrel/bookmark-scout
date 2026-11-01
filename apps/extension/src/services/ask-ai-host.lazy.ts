/**
 * Ask AI in the AI host page: each chat is a Pi Durable conversation in its own IndexedDB database
 * (`INDEXED_DATABASES.askAiChat`), so an answer goes on after the popup closes, picks up after a
 * restart, and deleting a chat deletes all of it. A private window's chat stays in memory only.
 *
 * Chat UIs attach over a port (`ASK_AI_PORT`) and get the chat as UI messages; the background sets
 * up each answer and runs every action call, since Chrome gives this page only the runtime API.
 * Once no answer runs and no chat UI is attached, the page tells the background it may close.
 * Like every `*.lazy.ts` file it is left out of auto-imports; import it only with `import()`.
 */

import type { AssistantMessage } from '@earendil-works/pi-ai';
import type { Conversation, ConversationView } from '@earendil-works/pi-durable';
import { MemoryStorage } from '@earendil-works/pi-durable';
import { IndexedDbStorage } from '@earendil-works/pi-durable/storage/indexeddb';
import type { ToolSet } from 'ai';
import { WEB_SEARCH_TOOLS } from './ai-agent.lazy';
import { createAIModel } from './ai-client.lazy';
import { AskAIDurable } from './ask-ai-durable.lazy';
import { createAskAISkills } from './ask-ai-skills.lazy';

type OpenChat = {
  id: string;
  ephemeral: boolean;
  service: AskAIDurable;
  chat: Conversation;
  /** The latest view, as the chat UI shows it. */
  view: Extract<AskAIHostMessage, { type: 'view' }>;
  ports: Set<Browser.runtime.Port>;
  setup?: Extract<AskAIHostSetup, { ok: true }>;
  /** Releases the database's Web Lock and stops the watch. */
  close: () => Promise<void>;
};

const chats = new Map<string, Promise<OpenChat>>();

const databaseName = (chatId: string) => `${INDEXED_DATABASES.askAiChat.name}-${chatId}`;

function send(message: unknown): Promise<unknown> {
  return browser.runtime.sendMessage(message);
}

/** Holds the database's Web Lock until `release`, so only this page writes to it. */
async function lockDatabase(name: string): Promise<() => void> {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await new Promise<void>((acquired, failed) => {
    navigator.locks
      .request(name, async () => {
        acquired();
        await held;
      })
      .catch(failed);
  });
  return release;
}

function firstQuestion(view: ConversationView): string {
  for (const entry of view.entries) {
    for (const message of entry.model ?? []) {
      if (message.role !== 'user') continue;
      return typeof message.content === 'string'
        ? message.content
        : message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join(' ');
    }
  }
  return '';
}

function toView(chatId: string, value: ConversationView): OpenChat['view'] {
  const live = value.docs['pi.live'] as
    | { run?: unknown; generation?: { message?: AssistantMessage } }
    | undefined;
  const partial = live?.generation?.message;
  const picture = toUIMessages(value.entries, partial);
  const running = live?.run !== undefined;
  const status: AskAIChatStatus = running
    ? partial && partial.content.length > 0
      ? 'streaming'
      : 'submitted'
    : picture.error
      ? 'error'
      : 'ready';
  return {
    type: 'view',
    chatId,
    messages: picture.messages,
    status,
    ...(picture.error ? { error: picture.error } : {}),
  };
}

const isRunning = (open: OpenChat) =>
  open.view.status === 'submitted' || open.view.status === 'streaming';

/** Tells the background the page may close once nothing runs and nobody watches. */
async function reportIdle(): Promise<void> {
  const open = await Promise.all([...chats.values()]);
  if (open.some((chat) => chat.ports.size > 0 || isRunning(chat))) return;
  await Promise.all(open.map((chat) => closeChat(chat.id)));
  await send({ type: ASK_AI_MESSAGE.idle }).catch(() => undefined);
}

async function closeChat(chatId: string): Promise<void> {
  const pending = chats.get(chatId);
  if (!pending) return;
  chats.delete(chatId);
  const open = await pending.catch(() => undefined);
  await open?.close();
}

function openChat(chatId: string, ephemeral: boolean): Promise<OpenChat> {
  const existing = chats.get(chatId);
  if (existing) return existing;
  const opening = (async (): Promise<OpenChat> => {
    const release = ephemeral ? () => {} : await lockDatabase(databaseName(chatId));
    const storage = ephemeral
      ? new MemoryStorage()
      : await IndexedDbStorage.open(databaseName(chatId));
    let open: OpenChat | undefined;
    const currentSetup = async () => {
      const setup = (await send({ type: ASK_AI_MESSAGE.setup, chatId })) as
        | AskAIHostSetup
        | undefined;
      if (!setup?.ok) throw new Error(setup?.error ?? t('error_unknown'));
      // Errors this page describes follow the extension's language, which it cannot read itself.
      setLanguage(setup.locale);
      await whenLanguageReady();
      if (open) open.setup = setup;
      return setup;
    };
    const service = await AskAIDurable.open({
      storage,
      setup: currentSetup,
      languageModel: async () => {
        const setup = open?.setup ?? (await currentSetup());
        return createAIModel(setup.settings, 'askAI', createAIHostStreamingFetch(setup.token));
      },
      providerTools: async (): Promise<ToolSet> => {
        const setup = open?.setup ?? (await currentSetup());
        const provider = setup.settings.provider;
        if (!setup.webSearch || !supportsWebSearch(provider)) return {};
        const search = await WEB_SEARCH_TOOLS[provider]({ maxUses: setup.webSearchMaxUses });
        return { [ASK_AI_WEB_SEARCH_TOOL]: search as ToolSet[string] };
      },
      callAction: (name, args, conversation) =>
        send({
          type: ASK_AI_MESSAGE.callAction,
          chatId,
          name,
          args,
          untrustedContentSeen: conversation.untrustedContentSeen,
          knownUrls: [...conversation.knownUrls],
        }),
      skills: createAskAISkills,
      describeError: describeAIErrorWithDetail,
    });
    const chat = await service.root();
    const watch = await chat.watch(service.context);
    open = {
      id: chatId,
      ephemeral,
      service,
      chat,
      view: toView(chatId, watch.value),
      ports: new Set(),
      close: async () => {
        await watch.stop();
        await service.close();
        release();
      },
    };
    const target = open;
    watch.start(async (value) => {
      const wasRunning = isRunning(target);
      target.view = toView(chatId, value);
      for (const port of target.ports) port.postMessage(target.view);
      const running = isRunning(target);
      if (!target.ephemeral && (running || wasRunning) && value.entries.length > 0) {
        void send({
          type: ASK_AI_MESSAGE.chat,
          chatId,
          title: chatTitle(firstQuestion(value)),
          updatedAt: Date.now(),
          running,
        }).catch(() => undefined);
      }
      if (wasRunning && !running) void reportIdle();
    });
    service.resume();
    return open;
  })();
  chats.set(chatId, opening);
  opening.catch(() => chats.delete(chatId));
  return opening;
}

async function deleteChat(chatId: string): Promise<void> {
  await closeChat(chatId);
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(databaseName(chatId));
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
  await send({ type: ASK_AI_MESSAGE.chatDeleted, chatId }).catch(() => undefined);
}

async function deleteAllChats(): Promise<void> {
  const prefix = `${INDEXED_DATABASES.askAiChat.name}-`;
  const databases = (await indexedDB.databases?.()) ?? [];
  const ids = new Set([
    ...[...chats.keys()],
    ...databases.flatMap((database) =>
      database.name?.startsWith(prefix) ? [database.name.slice(prefix.length)] : [],
    ),
  ]);
  await Promise.all([...ids].map(deleteChat));
}

/** Serves one chat UI over its port; `buffered` are the messages it sent while this page loaded. */
export function serve(port: Browser.runtime.Port, buffered: readonly unknown[] = []): void {
  let attached: { chatId: string; ephemeral: boolean } | undefined;
  const post = (message: AskAIHostMessage) => {
    try {
      port.postMessage(message);
    } catch {
      // The UI closed.
    }
  };
  const fail = (error: unknown) => post({ type: 'error', message: getErrorMessage(error) });
  const current = async () => {
    if (!attached) throw new Error('No chat attached');
    const open = await openChat(attached.chatId, attached.ephemeral);
    open.ports.add(port);
    return open;
  };
  const detach = async () => {
    if (!attached) return;
    const open = await chats.get(attached.chatId)?.catch(() => undefined);
    open?.ports.delete(port);
  };
  port.onDisconnect.addListener(() => {
    void detach().then(reportIdle);
  });
  const onMessage = async (raw: unknown) => {
    const parsed = askAIClientMessageSchema.safeParse(raw);
    if (!parsed.success) return;
    const message = parsed.data;
    await (async () => {
      switch (message.type) {
        case 'attach': {
          await detach();
          attached = {
            chatId: message.chatId ?? crypto.randomUUID(),
            ephemeral: message.ephemeral,
          };
          // A chat without a database yet shows empty until its first message creates one.
          if (message.chatId || chats.has(attached.chatId)) post((await current()).view);
          else post({ type: 'view', chatId: attached.chatId, messages: [], status: 'ready' });
          break;
        }
        case 'send': {
          const open = await current();
          await open.service.send(open.chat, message.text, message.requestId);
          break;
        }
        case 'stop': {
          const open = await current();
          await open.service.stop(open.chat);
          break;
        }
        case 'decide': {
          const open = await current();
          const decided = await open.service.decide(open.chat, message.callId, message.approved);
          if (!decided.ok) post(open.view);
          break;
        }
        case 'delete':
          await deleteChat(message.chatId);
          break;
        case 'deleteAll':
          await deleteAllChats();
          break;
      }
    })().catch(fail);
  };
  // In order: each message waits for the one before it (attach before send).
  let queue = Promise.resolve();
  const enqueue = (raw: unknown) => {
    queue = queue.then(() => onMessage(raw));
  };
  for (const raw of buffered) enqueue(raw);
  port.onMessage.addListener(enqueue);
}

/** The background asks to pick up running chats after a restart, or to delete dropped ones. */
export function handleBackgroundMessage(message: Record<string, unknown>): void {
  const ids = Array.isArray(message.chatIds) ? message.chatIds.map(String) : [];
  if (message.type === ASK_AI_MESSAGE.resume) {
    for (const id of ids) void openChat(id, false).catch(() => undefined);
  } else if (message.type === ASK_AI_MESSAGE.forget) {
    for (const id of ids) void deleteChat(id);
  }
}
