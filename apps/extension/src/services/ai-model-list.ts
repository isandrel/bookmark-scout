/**
 * Lists a provider's models through its own REST endpoint and classifies connection failures.
 * The AI SDK has no model-listing API for direct providers, so each response shape is adapted
 * here; which shape a provider uses is configured per provider in settings.default.toml.
 */

/** Response shapes of provider model-list endpoints. `none` means the provider has no list. */
export type ModelListStyle = 'openai' | 'anthropic' | 'google' | 'ollama' | 'none';

export type AIConnectionErrorCode =
  | 'invalid_key'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'origin_rejected'
  | 'unreachable'
  | 'timeout'
  | 'not_api'
  | 'http_error';

/** A failed provider request, with a code the UI turns into a localized, actionable message. */
export class AIConnectionError extends Error {
  readonly code: AIConnectionErrorCode;
  readonly status?: number;

  constructor(code: AIConnectionErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'AIConnectionError';
    this.code = code;
    this.status = status;
  }
}

const { limits } = aiRuntimeConfig;

/** Anthropic only answers browser-origin requests that opt in with this header. */
export const ANTHROPIC_BROWSER_ACCESS_HEADER = {
  'anthropic-dangerous-direct-browser-access': 'true',
} as const;

type ModelPage = { models: DetectedAIModel[]; next?: URL };

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function joinUrl(baseUrl: string, path: string): URL {
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
}

function isLocalHost(url: URL): boolean {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
}

/** Request headers for the model list: auth in the provider's own style plus the extra headers. */
export function modelListHeaders(
  style: ModelListStyle,
  settings: AISettings,
): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json', ...settings.extraHeaders };
  const apiKey = settings.apiKey.trim();
  switch (style) {
    case 'anthropic':
      Object.assign(headers, ANTHROPIC_BROWSER_ACCESS_HEADER, {
        'anthropic-version': limits.anthropic_version,
      });
      if (apiKey) headers['x-api-key'] = apiKey;
      break;
    case 'google':
      if (apiKey) headers['x-goog-api-key'] = apiKey;
      break;
    case 'openai':
    case 'ollama':
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      break;
    case 'none':
      break;
  }
  const { organization, project } = settings.providerOptions ?? {};
  if (style === 'openai' && organization) headers['OpenAI-Organization'] = organization;
  if (style === 'openai' && project) headers['OpenAI-Project'] = project;
  return headers;
}

function firstUrl(style: ModelListStyle, baseUrl: string): URL {
  switch (style) {
    case 'anthropic': {
      const url = joinUrl(baseUrl, 'models');
      url.searchParams.set('limit', String(limits.model_list_page_size));
      return url;
    }
    case 'google': {
      const url = joinUrl(baseUrl, 'models');
      url.searchParams.set('pageSize', String(limits.model_list_page_size));
      return url;
    }
    case 'ollama':
      return joinUrl(baseUrl, 'tags');
    default:
      return joinUrl(baseUrl, 'models');
  }
}

const stringField = (item: JsonRecord, key: string) =>
  typeof item[key] === 'string' && item[key] ? (item[key] as string) : undefined;

/** Parses one page of a model-list response; returns null when it is not that provider's shape. */
export function parseModelPage(
  style: ModelListStyle,
  payload: unknown,
  requestUrl: URL,
): ModelPage | null {
  if (!isRecord(payload)) return null;
  switch (style) {
    case 'openai': {
      if (!Array.isArray(payload.data)) return null;
      const models = payload.data.filter(isRecord).flatMap((item) => {
        const id = stringField(item, 'id');
        return id ? [{ id, name: stringField(item, 'name') ?? id }] : [];
      });
      return { models };
    }
    case 'anthropic': {
      if (!Array.isArray(payload.data)) return null;
      const models = payload.data.filter(isRecord).flatMap((item) => {
        const id = stringField(item, 'id');
        return id ? [{ id, name: stringField(item, 'display_name') ?? id }] : [];
      });
      const lastId = stringField(payload, 'last_id');
      let next: URL | undefined;
      if (payload.has_more === true && lastId) {
        next = new URL(requestUrl);
        next.searchParams.set('after_id', lastId);
      }
      return { models, next };
    }
    case 'google': {
      if (!Array.isArray(payload.models)) return null;
      const models = payload.models.filter(isRecord).flatMap((item) => {
        const name = stringField(item, 'name');
        const methods = Array.isArray(item.supportedGenerationMethods)
          ? item.supportedGenerationMethods
          : [];
        // Embedding and image-only models cannot answer prompts.
        if (!name || !methods.includes('generateContent')) return [];
        const id = name.replace(/^models\//, '');
        return [{ id, name: stringField(item, 'displayName') ?? id }];
      });
      const token = stringField(payload, 'nextPageToken');
      let next: URL | undefined;
      if (token) {
        next = new URL(requestUrl);
        next.searchParams.set('pageToken', token);
      }
      return { models, next };
    }
    case 'ollama': {
      if (!Array.isArray(payload.models)) return null;
      const models = payload.models.filter(isRecord).flatMap((item) => {
        const id = stringField(item, 'name') ?? stringField(item, 'model');
        return id ? [{ id, name: id }] : [];
      });
      return { models };
    }
    case 'none':
      return null;
  }
}

/** Some providers answer a bad key with 400 instead of 401. */
function looksLikeInvalidKey(body: string): boolean {
  return /API_KEY_INVALID|invalid[ _-]?api[ _-]?key|incorrect api key|invalid x-api-key/i.test(body);
}

function connectionErrorForStatus(status: number, body: string, url: URL): AIConnectionError {
  const host = url.host;
  if (status === 401) return new AIConnectionError('invalid_key', t('ai_connErrorInvalidKey'), status);
  if (status === 400 && looksLikeInvalidKey(body)) {
    return new AIConnectionError('invalid_key', t('ai_connErrorInvalidKey'), status);
  }
  if (status === 403) {
    // Ollama and LM Studio reject extension origins with 403 until they are allowed.
    return isLocalHost(url)
      ? new AIConnectionError('origin_rejected', t('ai_connErrorOriginRejected'), status)
      : new AIConnectionError('forbidden', t('ai_connErrorForbidden'), status);
  }
  if (status === 404) return new AIConnectionError('not_found', t('ai_connErrorNotFound'), status);
  if (status === 429) {
    return new AIConnectionError('rate_limited', t('ai_connErrorRateLimited'), status);
  }
  return new AIConnectionError('http_error', t('ai_connErrorHttp', [String(status), host]), status);
}

async function fetchJson(
  url: URL,
  headers: Record<string, string>,
  signal: AbortSignal | undefined,
  fetch: typeof globalThis.fetch,
) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, limits.model_list_timeout_ms);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    let response: Response;
    try {
      response = await fetch(url, { headers, signal: controller.signal });
    } catch (error) {
      if (timedOut) {
        throw new AIConnectionError(
          'timeout',
          t('ai_connErrorTimeout', [url.host, String(limits.model_list_timeout_ms / 1000)]),
        );
      }
      if (signal?.aborted) throw error;
      // Network failures, refused ports, DNS errors, and CORS rejections all look the same here.
      throw new AIConnectionError('unreachable', t('ai_connErrorUnreachable', url.host));
    }
    const body = await response.text();
    if (!response.ok) throw connectionErrorForStatus(response.status, body, url);
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new AIConnectionError('not_api', t('ai_connErrorNotApi'));
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

/**
 * Fetches every page of the provider's model list. Throws AIConnectionError on failures, and
 * when the provider has no model list (`none`).
 */
export async function listProviderModels(
  settings: AISettings,
  options: { signal?: AbortSignal; source?: AIActivitySource } = {},
): Promise<DetectedAIModel[]> {
  const style = getProviderModelListStyle(settings.provider);
  const baseUrl = getProviderEndpoint(settings.provider, settings.baseUrl, settings.providerOptions);
  if (style === 'none' || !baseUrl) {
    throw new Error(t('error_aiModelListUnavailable'));
  }
  const headers = modelListHeaders(style, settings);
  const fetch = createLoggingFetch({
    source: options.source ?? 'modelList',
    provider: settings.provider,
  });
  const seen = new Map<string, DetectedAIModel>();
  let url: URL | undefined = firstUrl(style, baseUrl);
  // Bounded, so a misbehaving endpoint cannot page forever.
  for (let page = 0; url && page < limits.model_list_max_pages; page += 1) {
    const payload = await fetchJson(url, headers, options.signal, fetch);
    const parsed = parseModelPage(style, payload, url);
    if (!parsed) throw new AIConnectionError('not_api', t('ai_connErrorNotApi'));
    for (const model of parsed.models) if (!seen.has(model.id)) seen.set(model.id, model);
    url = parsed.next;
  }
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}
