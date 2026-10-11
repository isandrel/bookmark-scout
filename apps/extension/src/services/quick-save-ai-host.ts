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

type ActiveCall = { provider: string; model: string };

/** AI calls in progress, by token; the host's provider requests must carry one of them. */
const activeCalls = new Map<string, ActiveCall>();
let firefoxFrame: HTMLIFrameElement | undefined;
let hostReady: Promise<void> | undefined;

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
      justification: 'Suggests a folder with AI and reads the page text for a quick save.',
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
  if (!response.ok) throw new Error(response.error);
  return response;
}

export type AIHostSession = {
  readPage: (url: string) => Promise<{ title?: string; text: string } | null>;
  generate: (request: { system: string; prompt: string }) => Promise<FolderRecommendationsObject>;
};

/**
 * Runs `work` with the AI host page open, then closes it once no other call needs it. Errors from
 * the provider come back already described in `locale`.
 */
export async function withAIHost<T>(
  settings: AISettings,
  locale: SupportedLocale,
  work: (session: AIHostSession) => Promise<T>,
): Promise<T> {
  const token = crypto.randomUUID();
  activeCalls.set(token, {
    provider: settings.provider,
    model: settings.model,
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
      generate: async ({ system, prompt }) => {
        const response = await askHost({
          type: QUICK_SAVE_MESSAGE.hostGenerate,
          token,
          settings,
          source: 'folderRecommendation',
          locale,
          schema: 'folderRecommendations',
          system,
          prompt,
        });
        return (response.ok ? response.object : undefined) as FolderRecommendationsObject;
      },
    });
  } finally {
    activeCalls.delete(token);
    if (activeCalls.size === 0) await closeHost();
  }
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
  if (!call) return { ok: false, error: 'No AI call in progress' };
  const { url, method, headers, body } = parsed.data;
  try {
    const logged = createLoggingFetch({ source: 'folderRecommendation', ...call });
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
