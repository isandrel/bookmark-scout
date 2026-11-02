/**
 * The Ask AI chat as the popup and side panel show it, run in the AI host page on Pi Durable
 * (`services/ask-ai-host.lazy.ts`): the page keeps answering after this UI closes, and this UI
 * shows the chat again when it reopens. Connects over a port and reconnects when the page went
 * away (Firefox suspends its background), and while open keeps Firefox's background from going
 * idle (`chatKeepAliveMs`); every action goes to the page, which owns the chat.
 */
import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';

type View = Extract<AskAIHostMessage, { type: 'view' }>;

export type AskAIChatState = {
  chatId: string | undefined;
  messages: UIMessage[];
  status: AskAIChatStatus;
  error: Error | undefined;
  sendMessage: (text: string) => void;
  stop: () => void;
  /** Sends the last question again, after a failed answer. */
  regenerate: () => void;
  clearError: () => void;
  /** Answers a call that waits for the user's approval. */
  respond: (callId: string, approved: boolean) => void;
  /** Shows a kept chat, or a new one without `chatId`. */
  openChat: (chatId?: string) => void;
  deleteChat: (chatId: string) => void;
  deleteAllChats: () => void;
};

function lastQuestion(messages: readonly UIMessage[]): string | undefined {
  const last = [...messages].reverse().find((message) => message.role === 'user');
  return last?.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('');
}

/**
 * The chat `initialChatId` names (a new one without it); `ephemeral` keeps it in memory only, for
 * a private window. `ready` waits until the caller knows which chat to show.
 */
export function useAskAIChat({
  initialChatId,
  ephemeral,
  ready,
}: {
  initialChatId: string | undefined;
  ephemeral: boolean;
  ready: boolean;
}): AskAIChatState {
  const [view, setView] = useState<View | undefined>();
  const [error, setError] = useState<Error | undefined>();
  const port = useRef<Browser.runtime.Port | undefined>(undefined);
  const chatId = useRef<string | undefined>(initialChatId);
  const pending = useRef<AskAIClientMessage[]>([]);

  const post = useCallback((message: AskAIClientMessage) => {
    if (port.current) port.current.postMessage(message);
    else pending.current.push(message);
  }, []);

  useEffect(() => {
    if (!ready) return;
    // Known only once the caller read the chat list, after this hook first ran.
    chatId.current ??= initialChatId;
    let closed = false;
    const connect = async () => {
      const opened = (await browser.runtime
        .sendMessage({ type: ASK_AI_MESSAGE.open })
        .catch(() => undefined)) as { ok: boolean; error?: string } | undefined;
      if (closed) return;
      if (!opened?.ok) {
        setError(new Error(opened?.error ?? t('error_unknown')));
        return;
      }
      const next = browser.runtime.connect({ name: ASK_AI_PORT });
      port.current = next;
      next.onMessage.addListener((message: AskAIHostMessage) => {
        if (message.type === 'view') {
          chatId.current = message.chatId;
          setView(message);
        } else {
          setError(new Error(message.message));
        }
      });
      next.onDisconnect.addListener(() => {
        port.current = undefined;
        // The host page closed (or Firefox suspended its background): open it again.
        if (!closed) void connect();
      });
      next.postMessage({
        type: 'attach',
        ...(chatId.current ? { chatId: chatId.current } : {}),
        ephemeral,
      } satisfies AskAIClientMessage);
      for (const message of pending.current.splice(0)) next.postMessage(message);
    };
    void connect();
    // Where the background is an event page, an open chat keeps it from going idle mid-answer.
    const keepAliveMs = browserProfile().chatKeepAliveMs;
    const keepAlive =
      keepAliveMs === null
        ? undefined
        : setInterval(() => {
            void browser.runtime
              .sendMessage({ type: ASK_AI_MESSAGE.keepAlive })
              .catch(() => undefined);
          }, keepAliveMs);
    return () => {
      closed = true;
      clearInterval(keepAlive);
      port.current?.disconnect();
      port.current = undefined;
    };
  }, [ready, ephemeral, initialChatId]);

  const messages = view?.messages ?? [];
  const status = view?.status ?? 'ready';
  const failed = view?.error ? new Error(view.error) : undefined;

  return {
    chatId: view?.chatId,
    messages,
    status,
    error: error ?? failed,
    sendMessage: (text) => {
      setError(undefined);
      post({ type: 'send', text, requestId: crypto.randomUUID() });
    },
    stop: () => post({ type: 'stop' }),
    regenerate: () => {
      const question = lastQuestion(messages);
      if (question) post({ type: 'send', text: question, requestId: crypto.randomUUID() });
    },
    clearError: () => setError(undefined),
    respond: (callId, approved) => post({ type: 'decide', callId, approved }),
    openChat: (next) => {
      setError(undefined);
      chatId.current = next;
      post({ type: 'attach', ...(next ? { chatId: next } : {}), ephemeral });
    },
    deleteChat: (id) => post({ type: 'delete', chatId: id }),
    deleteAllChats: () => post({ type: 'deleteAll' }),
  };
}
