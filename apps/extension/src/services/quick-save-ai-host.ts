/**
 * The background's side of AI quick save. A service worker cannot load the AI SDK (it is bundled
 * apart and loaded with `import()`, which workers reject) or parse HTML, so the request and page
 * reading run in the AI host page (`ai-host.html`): an offscreen document in Chrome and Edge, and
 * a frame in Firefox's background page. Chrome gives an offscreen document only the runtime API,
 * so the host hands every provider request back here, where the logging fetch records it in the
 * AI activity log and checks consent, exactly as for a request from the popup.
 *
 * Never import the AI client's request functions here: they would pull the AI SDK into the
 * background bundle (`tests/e2e/lazy-ai-sdk.spec.ts`).
 */

export const AI_HOST_PATH = '/ai-host.html';

/**
 * An AI call in progress: its service (none when it only reads pages, as for local agents), and
 * what made it, which its log entries name. A session with no source (a background job reading
 * page heads) makes no AI request, so the host cannot send one for it.
 */
type ActiveCall = { provider?: string; model?: string; source?: AIActivitySource };

/** AI calls in progress, by token; the host's provider requests must carry one of them. */
const activeCalls = new Map<string, ActiveCall>();
let firefoxFrame: HTMLIFrameElement | undefined;
let hostReady: Promise<void> | undefined;
/** The page holds a warm built-in session, so it stays open until it reports itself idle. */
let warmHost = false;

function hostUrl(): string {
  return browser.runtime.getURL(AI_HOST_PATH);
}

async function openHost(): Promise<void> {
  if (browser.offscreen) {
    const existing = await browser.runtime
      .getContexts?.({ contextTypes: ['OFFSCREEN_DOCUMENT'] })
      .catch(() => []);
    if (existing && existing.length > 0) return;
    await browser.offscreen.createDocument({
      url: AI_HOST_PATH,
      reasons: ['DOM_PARSER'],
      justification: 'Suggests folders with AI, reads page text, and reads page titles.',
    });
    return;
  }
  // Firefox's background is a page, which can hold the host page in a frame.
  if (firefoxFrame?.isConnected) return;
  const frame = document.createElement('iframe');
  const loaded = new Promise<void>((resolve, reject) => {
    frame.addEventListener('load', () => resolve(), { once: true });
    frame.addEventListener('error', () => reject(new Error('AI host page failed to load')), {
      once: true,
    });
  });
  frame.src = hostUrl();
  document.body.append(frame);
  firefoxFrame = frame;
  await loaded;
}

async function closeHost(): Promise<void> {
  hostReady = undefined;
  warmHost = false;
  if (browser.offscreen) {
    await browser.offscreen.closeDocument().catch(() => undefined);
    return;
  }
  firefoxFrame?.remove();
  firefoxFrame = undefined;
}

async function askHost(request: QuickSaveHostRequest): Promise<QuickSaveHostResponse> {
  const response = (await browser.runtime.sendMessage(request)) as
    | QuickSaveHostResponse
    | undefined;
  if (!response) throw new Error(t('quickSave_aiHostUnavailable'));
  if (!response.ok) throw new AIHostError(response.error, response.errorKind);
  return response;
}

/** What each schema the AI host page knows (`AIHostSchemaName`) answers with. */
export type AIHostSchemaOutputs = {
  folderRecommendations: FolderRecommendationsObject;
  folderIds: BuiltinFolderAnswer;
  reorganization: ReorganizationResult;
};

/** An AI call the host page could not complete, with whether the model answered at all. */
export class AIHostError extends Error {
  constructor(
    message: string,
    /**
     * `answer`: the request worked, but the answer did not fit; the next request may work.
     * `keyRequired`: the service wants an API key it was not sent.
     */
    readonly kind?: AIHostErrorKind,
  ) {
    super(message);
    this.name = 'AIHostError';
  }
}

type AIHostGenerateRequest<Name extends AIHostSchemaName> = {
  schema: Name;
  /** For `folderIds`: the ids the answer may hold, and how many at most. */
  choices?: string[];
  maxChoices?: number;
  system: string;
  prompt: string;
};

export type AIHostSession = {
  readPage: (url: string) => Promise<{ title?: string; text: string } | null>;
  /** Reads a fetched page's `<head>`, which a service worker cannot parse itself. */
  readHead: (html: string, descriptions: boolean) => Promise<HtmlHead>;
  /** Reads a downloaded page for Index Page Text, which a service worker cannot parse itself. */
  readText: (html: string, maxChars: number) => Promise<PageTextReading>;
  generate: <Name extends AIHostSchemaName>(
    request: AIHostGenerateRequest<Name>,
  ) => Promise<AIHostSchemaOutputs[Name]>;
};

/**
 * Runs `work` with the AI host page open, then closes it once no other call needs it. Every
 * provider request it makes is logged under `source`. Errors from the provider come back already
 * described in `locale`. Without `settings` the session can only read pages. With `keepOpen` (the
 * browser's built-in model, whose warm session lives in the page) the page stays open after the
 * call; it asks to be closed once that session is idle (`closeIdleAIHost`).
 */
export async function withAIHost<T>(
  settings: AISettings | null,
  {
    locale,
    source,
    keepOpen = false,
  }: { locale: SupportedLocale; source?: AIActivitySource; keepOpen?: boolean },
  work: (session: AIHostSession) => Promise<T>,
): Promise<T> {
  const token = crypto.randomUUID();
  activeCalls.set(token, {
    ...(settings ? { provider: settings.provider, model: settings.model } : {}),
    ...(source ? { source } : {}),
  });
  try {
    hostReady ??= openHost().catch((error: unknown) => {
      hostReady = undefined;
      throw error;
    });
    await hostReady;
    return await work({
      readPage: async (url) => {
        // The host reads public http and https pages only.
        if (!/^https?:/i.test(url)) return null;
        const response = await askHost({ type: QUICK_SAVE_MESSAGE.hostReadPage, token, url });
        return response.ok ? (response.page ?? null) : null;
      },
      readHead: async (html, descriptions) => {
        const response = await askHost({
          type: QUICK_SAVE_MESSAGE.hostReadHead,
          token,
          html,
          descriptions,
        });
        return response.ok ? (response.head ?? {}) : {};
      },
      readText: async (html, maxChars) => {
        const response = await askHost({
          type: QUICK_SAVE_MESSAGE.hostReadText,
          token,
          html,
          maxChars,
        });
        // A page the host failed to read has no text; an answer of another shape is a bug.
        return response.ok ? pageTextReadingSchema.parse(response.reading) : { status: 'empty' };
      },
      generate: async <Name extends AIHostSchemaName>({
        schema,
        choices,
        maxChoices,
        system,
        prompt,
      }: AIHostGenerateRequest<Name>) => {
        if (!settings || !source) throw new Error('No AI service was given for this session.');
        const response = await askHost({
          type: QUICK_SAVE_MESSAGE.hostGenerate,
          token,
          settings,
          source,
          locale,
          schema,
          ...(choices ? { choices } : {}),
          ...(maxChoices ? { maxChoices } : {}),
          system,
          prompt,
        });
        // The host parsed the answer with this schema before sending it.
        return (response.ok ? response.object : undefined) as AIHostSchemaOutputs[Name];
      },
    });
  } finally {
    activeCalls.delete(token);
    if (keepOpen) warmHost = true;
    else if (activeCalls.size === 0 && !warmHost) await closeHost();
  }
}

/**
 * Closes the AI host page when its warm built-in session went idle (the page's own message), unless
 * a call is running in it. Ignores messages from anywhere else.
 */
export async function closeIdleAIHost(
  message: unknown,
  sender: Browser.runtime.MessageSender,
): Promise<void> {
  if (!isPlainObject(message) || message.type !== QUICK_SAVE_MESSAGE.hostIdle) return;
  if (!isFromAIHost(sender)) return;
  warmHost = false;
  if (activeCalls.size === 0) await closeHost();
}

/**
 * Records one call to the browser's built-in model the AI host page made (it cannot reach storage)
 * in the AI activity log, under the service and source of the AI call in progress. Ignores a
 * message that is not from the host or names no call in progress.
 */
export async function recordAIHostActivity(
  message: unknown,
  sender: Browser.runtime.MessageSender,
): Promise<void> {
  const parsed = quickSaveHostActivitySchema.safeParse(message);
  if (!parsed.success || !isFromAIHost(sender)) return;
  const call = activeCalls.get(parsed.data.token);
  if (!call?.provider || !call.model || !call.source) return;
  const { input, output, error, durationMs } = parsed.data;
  await recordOnDeviceActivity({
    source: call.source,
    provider: call.provider,
    model: call.model,
    input,
    ...(output !== undefined ? { output } : {}),
    ...(error !== undefined ? { error } : {}),
    durationMs,
  });
}

function isFromAIHost(sender: Browser.runtime.MessageSender): boolean {
  return sender.id === browser.runtime.id && !sender.tab && sender.url === hostUrl();
}

/**
 * Sends one provider request for the AI host page through the logging fetch, which records it
 * and, in Firefox, refuses it without data sharing consent. Null when the message is not a valid
 * request from the host during an AI call.
 */
export async function forwardAIHostFetch(
  message: unknown,
  sender: Browser.runtime.MessageSender,
): Promise<QuickSaveHostFetchResponse | null> {
  const parsed = quickSaveHostFetchSchema.safeParse(message);
  if (!parsed.success || !isFromAIHost(sender)) return null;
  const call = activeCalls.get(parsed.data.token);
  if (!call?.source) return { ok: false, error: 'No AI call in progress' };
  const { url, method, headers, body } = parsed.data;
  try {
    const logged = createLoggingFetch({ ...call, source: call.source });
    const response = await logged(url, { method, headers, body });
    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
      body: await response.text(),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
