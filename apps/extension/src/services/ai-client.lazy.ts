/**
 * The part of the AI client that needs the AI SDK: provider factories, model wiring, and the
 * calls. It loads on first use through `loadAIRuntime` in ai-client.ts, so pages that never call
 * AI do not download it, and each provider package loads only when its provider is used. Like
 * every `*.lazy.ts` file it is left out of auto-imports; import it only with `import()`.
 */

import { generateObject, generateText, type LanguageModel } from 'ai';

/**
 * A language model for the settings. `source` names what makes the calls (a tool name) in the
 * AI activity log, which records them when the user turned recording on.
 */
export async function createAIModel(
  settings: AISettings,
  source: AIActivitySource = 'ai',
): Promise<LanguageModel> {
  validateAISettings(settings);

  const modelId =
    settings.customModel?.trim() || settings.model || getDefaultModel(settings.provider);
  const kind = getProviderKind(settings.provider);
  const fetch = createLoggingFetch({ source, provider: settings.provider, model: modelId });

  switch (kind) {
    case 'native':
      return createNativeModel(settings, modelId, fetch);
    case 'ollama': {
      const { createOllama } = await import('ollama-ai-provider-v2');
      const ollama = createOllama({
        baseURL: settings.baseUrl || getProviderBaseUrl(settings.provider),
        headers: settings.extraHeaders,
        fetch,
      });
      return ollama(modelId);
    }
    case 'anthropic_compatible': {
      const { createAnthropic } = await import('@ai-sdk/anthropic');
      const compatible = createAnthropic({
        apiKey: settings.apiKey,
        baseURL: settings.baseUrl || getProviderBaseUrl(settings.provider),
        headers: { ...ANTHROPIC_BROWSER_ACCESS_HEADER, ...settings.extraHeaders },
        fetch,
      });
      return compatible(modelId);
    }
    case 'openai_compatible': {
      const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
      // Chat Completions is the API that OpenAI-compatible servers share; the OpenAI package
      // would call OpenAI's own Responses API, which most of them do not implement.
      const compatible = createOpenAICompatible({
        name: settings.provider,
        apiKey: settings.apiKey || undefined,
        baseURL: settings.baseUrl || getProviderBaseUrl(settings.provider) || '',
        headers: settings.extraHeaders,
        // Send the JSON schema as response_format so structured results parse; without it the
        // schema is dropped and models answer in prose.
        supportsStructuredOutputs: true,
        fetch,
      });
      return compatible.chatModel(modelId);
    }
    default:
      throw new Error(`Unsupported provider kind: ${kind satisfies never}`);
  }
}

/**
 * `generateObject` on the model for `request.settings`, behind `generateAIObject` in ai-client.ts.
 * Named apart from it: a chunk keeps its exports' names, and the auto-import scan reads a
 * surviving auto-import name as a missed import.
 */
export async function requestAIObject<T>(request: AIObjectRequest<T>): Promise<{ object: T }> {
  const { settings, source, ...options } = request;
  const { object } = await generateObject({
    ...options,
    model: await createAIModel(settings, source),
  });
  return { object };
}

/** `generateText` on the model for `request.settings`, for Verify Service's one-word prompt. */
export async function requestAIText(request: AITextRequest): Promise<{ text: string }> {
  const { settings, source, ...prompt } = request;
  const { text } = await generateText({ ...prompt, model: await createAIModel(settings, source) });
  return { text };
}

/**
 * Native SDKs use their own endpoint unless the user configured a Base URL; extra headers always
 * apply so Verify Service and real calls hit the same configured endpoint.
 */
function nativeProviderOptions(settings: AISettings, fetch: typeof globalThis.fetch) {
  return {
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl || undefined,
    headers: settings.extraHeaders,
    fetch,
  };
}

const optionValue = (settings: AISettings, field: AIProviderExtraField) =>
  settings.providerOptions?.[field]?.trim() || undefined;

async function createNativeModel(
  settings: AISettings,
  modelId: string,
  fetch: typeof globalThis.fetch,
): Promise<LanguageModel> {
  switch (settings.provider) {
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai');
      const openai = createOpenAI({
        ...nativeProviderOptions(settings, fetch),
        organization: optionValue(settings, 'organization'),
        project: optionValue(settings, 'project'),
      });
      return openai(modelId);
    }
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic');
      const anthropic = createAnthropic({
        ...nativeProviderOptions(settings, fetch),
        // Without it, Anthropic rejects requests that come from a browser origin.
        headers: { ...ANTHROPIC_BROWSER_ACCESS_HEADER, ...settings.extraHeaders },
      });
      return anthropic(modelId);
    }
    case 'xai': {
      const { createXai } = await import('@ai-sdk/xai');
      return createXai(nativeProviderOptions(settings, fetch))(modelId);
    }
    case 'azure': {
      const { createAzure } = await import('@ai-sdk/azure');
      // The model id is the deployment name; a Base URL, when set, replaces the resource name.
      const azure = createAzure({
        ...nativeProviderOptions(settings, fetch),
        resourceName: settings.baseUrl ? undefined : optionValue(settings, 'resourceName'),
        apiVersion: optionValue(settings, 'apiVersion'),
      });
      return azure(modelId);
    }
    case 'google': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      return createGoogleGenerativeAI(nativeProviderOptions(settings, fetch))(modelId);
    }
    case 'groq': {
      const { createGroq } = await import('@ai-sdk/groq');
      return createGroq(nativeProviderOptions(settings, fetch))(modelId);
    }
    case 'mistral': {
      const { createMistral } = await import('@ai-sdk/mistral');
      return createMistral(nativeProviderOptions(settings, fetch))(modelId);
    }
    case 'deepseek': {
      const { createDeepSeek } = await import('@ai-sdk/deepseek');
      return createDeepSeek(nativeProviderOptions(settings, fetch))(modelId);
    }
    default:
      return createCompatibleFallback(settings, modelId, fetch);
  }
}

async function createCompatibleFallback(
  settings: AISettings,
  modelId: string,
  fetch: typeof globalThis.fetch,
): Promise<LanguageModel> {
  const { createOpenAI } = await import('@ai-sdk/openai');
  const compatible = createOpenAI({
    apiKey: settings.apiKey || 'not-required',
    baseURL: settings.baseUrl || getProviderBaseUrl(settings.provider),
    headers: settings.extraHeaders,
    fetch,
  });
  return compatible(modelId);
}
