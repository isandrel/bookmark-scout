/**
 * Ask AI: a chat with the default AI service inside the popup and side panel. With Keep Chats on
 * (the default), each finished answer keeps the chat on this device (`ask-ai-chats.ts`), the panel
 * opens on the last chat, and Past chats reopens or deletes the others; with it off, messages stay
 * in memory only and closing the panel ends the conversation. Answers render as Markdown without raw
 * HTML, and links open in a new tab. The chat needs the AI SDK, so `AskAIPanel` loads this file
 * when Ask AI opens; like every `*.lazy.tsx` file it is left out of auto-imports.
 */
import { useChat } from '@ai-sdk/react';
import {
  type ChatTransport,
  DirectChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from 'ai';
import {
  ArrowLeft,
  ArrowUp,
  CircleAlert,
  Globe,
  History,
  Loader2,
  MessageSquarePlus,
  Sparkles,
  Square,
} from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ActionApprovalRequest } from './ActionApproval.lazy';
import { ChatSuggestions } from './ChatSuggestions.lazy';

/** Builds the agent per message, so the current service and settings always apply. */
class AskAITransport implements ChatTransport<UIMessage> {
  async sendMessages(options: Parameters<ChatTransport<UIMessage>['sendMessages']>[0]) {
    const agent = await createAskAIAgent();
    const transport = new DirectChatTransport({
      agent,
      sendSources: true,
      // The stream hides errors by default; say what to fix in the user's language, keeping the
      // provider's own words when its status alone is not specific.
      onError: (error) => describeAIErrorWithDetail(error),
    }) as unknown as ChatTransport<UIMessage>;
    return transport.sendMessages(options);
  }

  async reconnectToStream() {
    return null;
  }
}

function hostOf(url: unknown): string {
  try {
    return new URL(String(url)).host;
  } catch {
    return String(url ?? '');
  }
}

/** What a tool call did, in words, from its name and input. */
function describeTool(name: string, input: unknown): string {
  if (ASK_AI_WEB_SEARCH_TOOL_NAMES.has(name)) return t('askAI_toolWebSearch');
  // A provider's own tool has no description; its internal name means nothing to the user.
  return describeActionCall(name, input) ?? t('askAI_toolOther');
}

type ApprovalResponder = (response: { id: string; approved: boolean }) => void;

function MessageView({
  message,
  respond,
}: {
  message: UIMessage;
  /** Answers a tool call that waits for the user's approval. */
  respond: ApprovalResponder;
}) {
  if (message.role === 'user') {
    const text = message.parts
      .flatMap((part) => (part.type === 'text' ? [part.text] : []))
      .join('');
    return (
      <div className="flex justify-end" data-testid="ask-ai-message" data-role="user">
        <p className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">
          {text}
        </p>
      </div>
    );
  }

  const sources = message.parts.flatMap((part) =>
    part.type === 'source-url' ? [{ url: part.url, title: part.title }] : [],
  );
  return (
    <div className="space-y-2" data-testid="ask-ai-message" data-role="assistant">
      {message.parts.map((part, index) => {
        const key = `${message.id}-${index}`;
        if (part.type === 'text') {
          return (
            <div
              key={key}
              className="ask-ai-markdown text-sm leading-relaxed [overflow-wrap:anywhere]"
            >
              <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) =>
                    href ? <UrlLink href={href}>{children}</UrlLink> : <span>{children}</span>,
                }}
              >
                {part.text}
              </Markdown>
            </div>
          );
        }
        if (isToolUIPart(part)) {
          // Not a step: the buttons are docked above the message box once the answer is done,
          // and a call the model has to repeat (a button left out, a failed try) is not news.
          if (getToolName(part) === SUGGEST_ACTIONS_ID) return null;
          if (part.state === 'approval-requested' && !part.approval.isAutomatic) {
            const { id } = part.approval;
            return (
              <ActionApprovalRequest
                key={key}
                toolName={getToolName(part)}
                input={part.input}
                reason={part.approval.requestReason}
                onRespond={(approved) => respond({ id, approved })}
              />
            );
          }
          const denied =
            part.state === 'output-denied' ||
            (part.state === 'approval-responded' && !part.approval.approved);
          const running = part.state === 'input-streaming' || part.state === 'input-available';
          return (
            <p
              key={key}
              data-testid="ask-ai-tool"
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              {running ? (
                <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles aria-hidden="true" className="h-3 w-3 text-ai" />
              )}
              <span className="truncate">{describeTool(getToolName(part), part.input)}</span>
              {denied && <span className="shrink-0">({t('askAI_denied')})</span>}
              {part.state === 'output-error' && (
                <span className="shrink-0">({t('askAI_failed')})</span>
              )}
            </p>
          );
        }
        return null;
      })}
      {sources.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          <p className="text-xs font-medium text-muted-foreground">{t('askAI_sources')}</p>
          <ul className="space-y-0.5 text-xs">
            {sources.map((source) => (
              <li key={source.url} className="truncate">
                <UrlLink href={source.url} className="text-primary">
                  {source.title || hostOf(source.url)}
                </UrlLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const SUGGESTION_KEYS = [
  'askAI_suggestionPage',
  'askAI_suggestionRelated',
  'askAI_suggestionFolders',
] as const;

export function AskAIChat({ onClose }: AskAIPanelProps) {
  const { state } = useAIServices();
  const { value: readPageContent } = useSetting('aiReadPageContent');
  // The service Ask AI uses: the default one, unless that is the built-in model, which runs no tools.
  const service = pickAIService(state, 'askAI');
  const provider = service?.provider;
  const canSearchWeb = provider ? supportsWebSearch(provider) : false;
  const { value: webSearch, setValue: setWebSearch } = useSetting('askAiWebSearch');
  const [transport] = useState(() => new AskAITransport());
  const { value: keepChats, isLoading: keepChatsLoading } = useSetting('askAiKeepChats');
  const { value: chatsMax } = useSetting('askAiChatsMax');
  const { value: chats, isLoading: chatsLoading } = useStoredValue(askAiChatsValue);
  const [chatId, setChatId] = useState<string>(() => crypto.randomUUID());
  const resumed = useRef(false);
  const {
    messages,
    sendMessage,
    status,
    stop,
    error,
    regenerate,
    setMessages,
    clearError,
    addToolApprovalResponse,
  } = useChat({
    transport,
    // An approved or declined change goes straight back to the agent to carry on.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const busy = status === 'submitted' || status === 'streaming';
  // Only a finished answer offers buttons, so they never sit above text still being written.
  const docked = status === 'ready' ? latestChatSuggestions(messages) : undefined;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Opens on the last chat once the kept chats are read; turning Keep Chats off deletes them.
  useEffect(() => {
    if (resumed.current || chatsLoading || keepChatsLoading) return;
    resumed.current = true;
    const [last] = chats;
    if (keepChats && last) {
      setChatId(last.id);
      setMessages(last.messages);
    }
  }, [chats, chatsLoading, keepChats, keepChatsLoading, setMessages]);
  useEffect(() => {
    if (!keepChatsLoading && !keepChats) void clearChats();
  }, [keepChats, keepChatsLoading]);
  // Keeps the chat once an answer is finished (or failed), never while it is still being written.
  useEffect(() => {
    if (!keepChats || !resumed.current || (status !== 'ready' && status !== 'error')) return;
    if (messages.length === 0) return;
    void keepChat(chatId, messages, chatsMax).catch((error) => {
      aiLogger.error({ error }, 'Failed to keep the Ask AI chat');
    });
  }, [chatId, chatsMax, keepChats, messages, status]);

  const openChat = (id: string, kept: readonly UIMessage[]) => {
    stop();
    clearError();
    setChatId(id);
    setMessages([...kept]);
    inputRef.current?.focus();
  };
  const startChat = () => openChat(crypto.randomUUID(), []);

  // Scrolls only the message list; scrollIntoView would also scroll the popup itself.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scrolls as the answer grows
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, status]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    clearError();
    void sendMessage({ text: trimmed });
    setDraft('');
  };

  // A chip that was clicked goes away with the dock; keep keyboard users in the message box.
  const sendSuggestion = (text: string) => {
    send(text);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send(draft);
    }
  };

  return (
    <section
      aria-labelledby="ask-ai-heading"
      className="flex h-full min-h-0 flex-col"
      data-testid="ask-ai"
    >
      <header className="flex h-11 shrink-0 items-center gap-1 border-b px-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label={t('askAI_back')}
          title={t('askAI_back')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2
          id="ask-ai-heading"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium"
        >
          <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0 text-ai" />
          <span className="shrink-0">{t('askAI_title')}</span>
          {service && (
            <span className="truncate text-xs font-normal text-muted-foreground">
              {service.name}
            </span>
          )}
        </h2>
        <AIServiceSwitcher />
        {keepChats && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('askAI_pastChats')}
                  title={t('askAI_pastChats')}
                  data-testid="ask-ai-past-chats"
                />
              }
            >
              <History className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-72">
              {chats.length === 0 ? (
                <DropdownMenuItem disabled>{t('askAI_noPastChats')}</DropdownMenuItem>
              ) : (
                chats.map((chat) => (
                  <DropdownMenuItem
                    key={chat.id}
                    onClick={() => openChat(chat.id, chat.messages)}
                    data-current={chat.id === chatId || undefined}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{chat.title || t('askAI_newChat')}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {formatDateTime(chat.updatedAt)}
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))
              )}
              {chats.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  {chats.some((chat) => chat.id === chatId) && (
                    <DropdownMenuItem
                      onClick={() => {
                        void deleteChat(chatId);
                        startChat();
                      }}
                    >
                      {t('askAI_deleteChat')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => {
                      void clearChats();
                      startChat();
                    }}
                  >
                    {t('askAI_deleteAllChats')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={startChat}
          disabled={messages.length === 0}
          aria-label={t('askAI_newChat')}
          title={t('askAI_newChat')}
        >
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </header>

      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto border-b px-3 py-3"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Sparkles aria-hidden="true" className="h-6 w-6 text-ai" />
            <p className="max-w-72 text-sm text-muted-foreground">{t('askAI_empty')}</p>
            <div className="flex flex-col items-stretch gap-1.5">
              {SUGGESTION_KEYS.map((key) => (
                <Button key={key} variant="outline" size="sm" onClick={() => send(t(key))}>
                  {t(key)}
                </Button>
              ))}
            </div>
            {!readPageContent && (
              <p className="max-w-72 text-xs text-muted-foreground">{t('askAI_readPageOff')}</p>
            )}
          </div>
        ) : (
          messages.map((message) => (
            <MessageView
              key={message.id}
              message={message}
              respond={(response) => void addToolApprovalResponse(response)}
            />
          ))
        )}
        {status === 'submitted' && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
            <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
            {t('askAI_thinking')}
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive-wash px-3 py-2 text-sm text-destructive-text"
          >
            <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1 space-y-1 [overflow-wrap:anywhere]">
              <p>{error.message || t('error_unknown')}</p>
              {isAIKeyRequiredMessage(error.message) ? (
                <Button variant="outline" size="sm" onClick={() => void openAISettings('askAI')}>
                  {t('ai_openServiceSettings')}
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => void regenerate()}>
                  {t('askAI_retry')}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {docked && (
        <ChatSuggestions
          // A new answer starts with fresh buttons: none used, no save waiting.
          key={docked.messageId}
          suggestions={docked.suggestions}
          send={sendSuggestion}
          typing={draft !== ''}
        />
      )}

      <form
        className="shrink-0 p-2"
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
      >
        <div className="flex items-end gap-1.5 rounded-lg border bg-card p-1.5 focus-within:ring-2 focus-within:ring-ring">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            aria-label={t('askAI_placeholder')}
            placeholder={t('askAI_placeholder')}
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
          {canSearchWeb && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-pressed={webSearch}
              aria-label={t('askAI_webSearch')}
              title={t('askAI_webSearch')}
              className={webSearch ? 'bg-ai/10 text-ai hover:bg-ai/15 hover:text-ai' : ''}
              onClick={() => {
                void setWebSearch(!webSearch).catch((error) => {
                  aiLogger.error({ error }, 'Failed to save the web search choice');
                });
              }}
            >
              <Globe className="h-4 w-4" />
            </Button>
          )}
          {busy ? (
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              onClick={() => stop()}
              aria-label={t('askAI_stop')}
              title={t('askAI_stop')}
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon-sm"
              disabled={!draft.trim()}
              aria-label={t('askAI_send')}
              title={t('askAI_send')}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
