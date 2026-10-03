/**
 * Ask AI: a chat with the default AI service inside the popup and side panel. Messages stay in
 * memory only; closing the panel ends the conversation. Answers render as Markdown without raw
 * HTML, and links open in a new tab.
 */
import { useChat } from '@ai-sdk/react';
import {
  type ChatTransport,
  DirectChatTransport,
  getToolName,
  isToolUIPart,
  type UIMessage,
} from 'ai';
import {
  ArrowLeft,
  ArrowUp,
  CircleAlert,
  Globe,
  Loader2,
  MessageSquarePlus,
  Sparkles,
  Square,
} from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Per device: whether Ask AI adds the provider's web search. */
const webSearchItem = storage.defineItem<boolean>('local:bookmark-scout-ask-ai-web-search', {
  fallback: false,
});

/** Builds the agent per message, so the current service and settings always apply. */
class AskAITransport implements ChatTransport<UIMessage> {
  constructor(private readonly getOptions: () => AskAIOptions) {}

  async sendMessages(options: Parameters<ChatTransport<UIMessage>['sendMessages']>[0]) {
    const agent = await createAskAIAgent(this.getOptions());
    const transport = new DirectChatTransport({
      agent,
      sendSources: true,
      // The stream hides errors by default; the provider's own message says what to fix.
      onError: (error) => (error instanceof Error ? error.message : String(error)),
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
  const args = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case 'searchBookmarks':
      return t('askAI_toolSearchBookmarks', String(args.query ?? ''));
    case 'listFolders':
      return t('askAI_toolListFolders');
    case 'getCurrentPage':
      return t('askAI_toolCurrentPage');
    case 'readPage':
      return t('askAI_toolReadPage', hostOf(args.url));
    case 'webSearch':
    case 'web_search':
    case 'google_search':
      return t('askAI_toolWebSearch');
    default:
      return name;
  }
}

function MessageView({ message }: { message: UIMessage }) {
  if (message.role === 'user') {
    const text = message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('');
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
            <div key={key} className="ask-ai-markdown text-sm leading-relaxed [overflow-wrap:anywhere]">
              <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  ),
                }}
              >
                {part.text}
              </Markdown>
            </div>
          );
        }
        if (isToolUIPart(part)) {
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
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {source.title || hostOf(source.url)}
                </a>
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

export function AskAIPanel({ onClose }: { onClose: () => void }) {
  const { state } = useAIServices();
  const { value: readPageContent } = useSetting('aiReadPageContent');
  const service = state.services.find((candidate) => candidate.id === state.defaultServiceId);
  const provider = service?.provider;
  const canSearchWeb = provider ? supportsWebSearch(provider) : false;
  const [webSearch, setWebSearch] = useState(false);
  const webSearchRef = useRef(false);
  webSearchRef.current = canSearchWeb && webSearch;
  const [transport] = useState(() => new AskAITransport(() => ({ webSearch: webSearchRef.current })));
  const { messages, sendMessage, status, stop, error, regenerate, setMessages, clearError } =
    useChat({ transport });
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const busy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    void webSearchItem.getValue().then(setWebSearch).catch(() => undefined);
    inputRef.current?.focus();
  }, []);

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
        <h2 id="ask-ai-heading" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium">
          <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0 text-ai" />
          <span className="shrink-0">{t('askAI_title')}</span>
          {service && (
            <span className="truncate text-xs font-normal text-muted-foreground">
              {service.name}
            </span>
          )}
        </h2>
        <AIServiceSwitcher />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            stop();
            setMessages([]);
            clearError();
            inputRef.current?.focus();
          }}
          disabled={messages.length === 0}
          aria-label={t('askAI_newChat')}
          title={t('askAI_newChat')}
        >
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </header>

      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3"
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
          messages.map((message) => <MessageView key={message.id} message={message} />)
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
              <Button variant="outline" size="sm" onClick={() => void regenerate()}>
                {t('askAI_retry')}
              </Button>
            </div>
          </div>
        )}
      </div>

      <form
        className="shrink-0 border-t p-2"
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
                const next = !webSearch;
                setWebSearch(next);
                void webSearchItem.setValue(next).catch(() => undefined);
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
