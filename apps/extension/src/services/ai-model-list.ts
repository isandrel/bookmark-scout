/**
 * Lists a provider's models through its own REST endpoint and classifies connection failures.
 * The AI SDK has no model-listing API for direct providers, so each response shape is adapted
 * here; which shape a provider uses is configured per provider in config/ai/providers/.
 */
import { z } from 'zod';
import type { MODEL_LIST_STYLES as MODEL_LIST_STYLE_NAMES } from '@/lib/config/ai-provider-schema';

/** Response shapes of provider model-list endpoints. `none` means the provider has no list. */
export type ModelListStyle = (typeof MODEL_LIST_STYLE_NAMES)[number];

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

const limits = readConfig(
  'ai/model-list',
  z.strictObject({
    model_list_timeout_ms: z.number().int().positive(),
    model_list_max_pages: z.number().int().positive(),
    model_list_page_size: z.number().int().positive(),
    anthropic_version: z.string().min(1),
  }),
);

/** Anthropic only answers browser-origin requests that opt in with this header. */
export const ANTHROPIC_BROWSER_ACCESS_HEADER = {
  'anthropic-dangerous-direct-browser-access': 'true',
} as const;

type ModelPage = { models: DetectedAIModel[]; next?: URL };

type JsonRecord = Record<string, unknown>;

/** How one response shape is requested and read. */
type ModelListStyleSpec = {
  /** Path of the list under the provider's base URL. */
  path: string;
  /** Query parameter that asks for the configured page size, for paginated lists. */
  pageSizeParam?: string;
  /** Auth and version headers in the provider's own style. */
  headers: (apiKey: string, settings: AISettings) => Record<string, string>;
  /** One page of models, or null when the payload is not this shape. */
  parse: (payload: JsonRecord, requestUrl: URL) => ModelPage | null;
};

const bearer = (apiKey: string): Record<string, string> =>
  apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

const stringField = (item: JsonRecord, key: string) =>
  typeof item[key] === 'string' && item[key] ? (item[key] as string) : undefined;

/** Records in `list` read with `read`; other entries are ignored. */
const readModels = (list: unknown[], read: (item: JsonRecord) => DetectedAIModel | undefined) =>
  list.filter(isPlainObject).flatMap((item) => {
    const model = read(item);
    return model ? [model] : [];
  });

/** The same URL with one query parameter set, for the next page of a list. */
function nextPage(requestUrl: URL, param: string, value: string | undefined): URL | undefined {
  if (!value) return undefined;
  const next = new URL(requestUrl);
  next.searchParams.set(param, value);
  return next;
}

/** Model-list request and response per style; `none` providers have no list. */
export const MODEL_LIST_STYLES: Record<Exclude<ModelListStyle, 'none'>, ModelListStyleSpec> = {
  openai: {
    path: 'models',
    headers: (apiKey, settings) => {
      const { organization, project } = settings.providerOptions ?? {};
      return {
        ...bearer(apiKey),
        ...(organization ? { 'OpenAI-Organization': organization } : {}),
        ...(project ? { 'OpenAI-Project': project } : {}),
      };
    },
    parse: (payload) => {
      if (!Array.isArray(payload.data)) return null;
      const models = readModels(payload.data, (item) => {
        const id = stringField(item, 'id');
        return id ? { id, name: stringField(item, 'name') ?? id } : undefined;
      });
      return { models };
    },
  },
  anthropic: {
    path: 'models',
    pageSizeParam: 'limit',
    headers: (apiKey) => ({
      ...ANTHROPIC_BROWSER_ACCESS_HEADER,
      'anthropic-version': limits.anthropic_version,
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
    }),
    parse: (payload, requestUrl) => {
      if (!Array.isArray(payload.data)) return null;
      const models = readModels(payload.data, (item) => {
        const id = stringField(item, 'id');
        return id ? { id, name: stringField(item, 'display_name') ?? id } : undefined;
      });
      const lastId = payload.has_more === true ? stringField(payload, 'last_id') : undefined;
      return { models, next: nextPage(requestUrl, 'after_id', lastId) };
    },
  },
  google: {
    path: 'models',
    pageSizeParam: 'pageSize',
    headers: (apiKey): Record<string, string> => (apiKey ? { 'x-goog-api-key': apiKey } : {}),
    parse: (payload, requestUrl) => {
      if (!Array.isArray(payload.models)) return null;
      const models = readModels(payload.models, (item) => {
        const name = stringField(item, 'name');
        const methods = Array.isArray(item.supportedGenerationMethods)
          ? item.supportedGenerationMethods
          : [];
        // Embedding and image-only models cannot answer prompts.
        if (!name || !methods.includes('generateContent')) return undefined;
        const id = name.replace(/^models\//, '');
        return { id, name: stringField(item, 'displayName') ?? id };
      });
      const token = stringField(payload, 'nextPageToken');
      return { models, next: nextPage(requestUrl, 'pageToken', token) };
    },
  },
  ollama: {
    path: 'tags',
    headers: bearer,
    parse: (payload) => {
      if (!Array.isArray(payload.models)) return null;
      const models = readModels(payload.models, (item) => {
        const id = stringField(item, 'name') ?? stringField(item, 'model');
        return id ? { id, name: id } : undefined;
      });
      return { models };
    },
  },
};

function joinUrl(baseUrl: string, path: string): URL {
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
}

/** Request headers for the model list: auth in the provider's own style plus the extra headers. */
export function modelListHeaders(
  style: ModelListStyle,
  settings: AISettings,
): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json', ...settings.extraHeaders };
  if (style === 'none') return headers;
  return { ...headers, ...MODEL_LIST_STYLES[style].headers(settings.apiKey.trim(), settings) };
}

function firstUrl(spec: ModelListStyleSpec, baseUrl: string): URL {
  const url = joinUrl(baseUrl, spec.path);
  if (spec.pageSizeParam) {
    url.searchParams.set(spec.pageSizeParam, String(limits.model_list_page_size));
  }
  return url;
}

/** Parses one page of a model-list response; returns null when it is not that provider's shape. */
export function parseModelPage(
  style: ModelListStyle,
  payload: unknown,
  requestUrl: URL,
): ModelPage | null {
  if (style === 'none' || !isPlainObject(payload)) return null;
  return MODEL_LIST_STYLES[style].parse(payload, requestUrl);
}

/** Some providers answer a bad key with 400 instead of 401. */
const INVALID_KEY_PATTERN =
  /API_KEY_INVALID|invalid[ _-]?api[ _-]?key|incorrect api key|invalid x-api-key/i;

/** Statuses with one meaning whatever the provider; others are handled below. */
const STATUS_ERRORS: Readonly<Record<number, { code: AIConnectionErrorCode; key: MessageKey }>> = {
  401: { code: 'invalid_key', key: 'ai_connErrorInvalidKey' },
  404: { code: 'not_found', key: 'ai_connErrorNotFound' },
  429: { code: 'rate_limited', key: 'ai_connErrorRateLimited' },
};

function connectionErrorForStatus(status: number, body: string, url: URL): AIConnectionError {
  const known = STATUS_ERRORS[status];
  if (known) return new AIConnectionError(known.code, t(known.key), status);
  if (status === 400 && INVALID_KEY_PATTERN.test(body)) {
    return new AIConnectionError('invalid_key', t('ai_connErrorInvalidKey'), status);
  }
  if (status === 403) {
    // Ollama and LM Studio reject extension origins with 403 until they are allowed.
    return isPrivateHost(url.hostname)
      ? new AIConnectionError('origin_rejected', t('ai_connErrorOriginRejected'), status)
      : new AIConnectionError('forbidden', t('ai_connErrorForbidden'), status);
  }
  return new AIConnectionError(
    'http_error',
    t('ai_connErrorHttp', [String(status), url.host]),
    status,
  );
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
          t('ai_connErrorTimeout', [
            url.host,
            String(limits.model_list_timeout_ms / MS_PER_SECOND),
          ]),
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
  let url: URL | undefined = firstUrl(MODEL_LIST_STYLES[style], baseUrl);
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
