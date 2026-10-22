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

type HostGenerateRequest = Extract<
  QuickSaveHostRequest,
  { type: typeof QUICK_SAVE_MESSAGE.hostGenerate }
>;

/**
 * The schema for each answer shape the background may ask for (`AI_HOST_SCHEMA_NAMES`), built
 * from the request; undefined when the request lacks what the shape needs.
 */
const AI_HOST_SCHEMAS = {
  folderRecommendations: () => folderRecommendationsSchema,
  folderIds: ({ choices, maxChoices }) =>
    choices && maxChoices ? builtinFolderAnswerSchema(choices, maxChoices) : undefined,
  reorganization: () => reorganizationResultSchema,
} satisfies {
  [Name in AIHostSchemaName]: (
    request: HostGenerateRequest,
  ) => z.ZodType<AIHostSchemaOutputs[Name]> | undefined;
};

let warmSessions: ReturnType<typeof createWarmBuiltinSessions> | undefined;

/**
 * Sessions and logging for the browser's built-in model in this page: a warm session copied for
 * each call (closed after `[quick_save] idle_timeout_ms` without one, when the page asks the
 * background to close it), and each call's activity log entry sent to the background.
 */
function onDeviceOptions(token: string): BuiltinOnDeviceOptions {
  warmSessions ??= createWarmBuiltinSessions({
    idleMs: builtinAIConfig.quick_save.idle_timeout_ms,
    onIdle: () => {
      const message: QuickSaveHostIdleMessage = { type: QUICK_SAVE_MESSAGE.hostIdle };
      void browser.runtime.sendMessage(message).catch(() => undefined);
    },
  });
  return {
    openSession: warmSessions.open,
    log: (call) => {
      const message: QuickSaveHostActivityMessage = {
        type: QUICK_SAVE_MESSAGE.hostActivity,
        token,
        ...call,
      };
      void browser.runtime.sendMessage(message).catch(() => undefined);
    },
  };
}

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
    return new Response(isNullBodyStatus(response.status) ? null : response.body, {
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
  if (request.type === QUICK_SAVE_MESSAGE.hostReadHead) {
    return { ok: true, head: readHtmlHead(request.html, request.descriptions) };
  }
  if (request.type === QUICK_SAVE_MESSAGE.hostReadText) {
    const text = await readHtmlText(request.html, request.maxChars);
    return { ok: true, ...(text ? { text } : {}) };
  }
  if (request.type === QUICK_SAVE_MESSAGE.hostReadPage) {
    const page = await readPageText(request.url);
    return { ok: true, page: page ?? null };
  }
  if (isSupportedLocale(request.locale)) {
    setLanguage(request.locale);
    await whenLanguageReady();
  }
  const settings = hostSettingsSchema.safeParse(request.settings);
  const schema = (
    AI_HOST_SCHEMAS[request.schema] as (request: HostGenerateRequest) => z.ZodType | undefined
  )(request);
  if (!settings.success || !schema || !isActivitySource(request.source)) {
    return { ok: false, error: t('error_unknown') };
  }
  const builtin = isBuiltinProvider(settings.data.provider);
  try {
    const { object } = await generateAIObject({
      settings: settings.data as AISettings,
      source: request.source,
      schema,
      system: request.system,
      prompt: request.prompt,
      transport: createAIHostTransport(request.token),
      ...(builtin
        ? {
            onDevice: onDeviceOptions(request.token),
            // The background cannot pass its time limit along; the small model gets the same.
            abortSignal: AbortSignal.timeout(builtinAIConfig.folders.timeout_ms),
          }
        : {}),
    });
    return { ok: true, object };
  } catch (error) {
    return {
      ok: false,
      error: describeAIError(error),
      ...(isNoAnswerError(error) ? { errorKind: 'answer' as const } : {}),
    };
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
