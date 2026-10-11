/**
 * The AI host page's side of AI quick save (`entrypoints/ai-host`): it runs the AI request and
 * reads the page for the background, which cannot (`services/quick-save-ai-host.ts`). In Chrome
 * it is an offscreen document with only the runtime API, so it reads no settings or storage:
 * everything comes in the request, and every provider request goes back to the background, which
 * logs it and checks consent.
 */

import { z } from 'zod';

const hostSettingsSchema = z.looseObject({
  enabled: z.boolean(),
  provider: z.string().min(1),
  model: z.string(),
  apiKey: z.string(),
});

const NULL_BODY_STATUSES: ReadonlySet<number> = new Set([101, 204, 205, 304]);

/** A fetch that hands each request to the background and rebuilds its response. */
export function createAIHostTransport(token: string): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const body =
      typeof init?.body === 'string'
        ? init.body
        : request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : await request.text();
    const message: QuickSaveHostFetchMessage = {
      type: QUICK_SAVE_MESSAGE.hostFetch,
      token,
      url: request.url,
      method: request.method,
      headers: [...request.headers.entries()],
      ...(body !== undefined ? { body } : {}),
    };
    const response = (await browser.runtime.sendMessage(message)) as
      | QuickSaveHostFetchResponse
      | undefined;
    // A failed request surfaces like a network error, which the AI error messages describe.
    if (!response?.ok) throw new TypeError(response?.error ?? 'Failed to fetch');
    return new Response(NULL_BODY_STATUSES.has(response.status) ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

function isSupportedLocale(locale: string): locale is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale);
}

function isActivitySource(source: string): source is AIActivitySource {
  return Object.hasOwn(AI_ACTIVITY_SOURCES, source);
}

/** Answers one request from the background. */
export async function handleAIHostRequest(
  request: QuickSaveHostRequest,
): Promise<QuickSaveHostResponse> {
  if (request.type === QUICK_SAVE_MESSAGE.hostReadPage) {
    const page = await readPageText(request.url);
    return { ok: true, page: page ?? null };
  }
  if (isSupportedLocale(request.locale)) {
    setLanguage(request.locale);
    await whenLanguageReady();
  }
  const settings = hostSettingsSchema.safeParse(request.settings);
  if (!settings.success || !isActivitySource(request.source)) {
    return { ok: false, error: t('error_unknown') };
  }
  try {
    const { object } = await generateAIObject({
      settings: settings.data as AISettings,
      source: request.source,
      schema: folderRecommendationsSchema,
      system: request.system,
      prompt: request.prompt,
      transport: createAIHostTransport(request.token),
    });
    return { ok: true, object };
  } catch (error) {
    return { ok: false, error: describeAIError(error) };
  }
}

/** Listens for the background's requests; only the extension itself may send them. */
export function startAIHost(): void {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const parsed = quickSaveHostRequestSchema.safeParse(message);
    if (!parsed.success || sender.id !== browser.runtime.id || sender.tab) return undefined;
    void handleAIHostRequest(parsed.data).then(sendResponse, (error: unknown) =>
      sendResponse({ ok: false, error: getErrorMessage(error) }),
    );
    return true;
  });
}
