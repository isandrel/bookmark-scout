/**
 * A fetch for AI provider SDKs and model listing that records each call in the AI activity log
 * when recording is on. It never changes the request or response, and recording failures never
 * reach the caller. Every provider call goes through it, so it is also where a call without the
 * user's consent stops: in Firefox, data sharing for the source's permission feature.
 */

/** What can make an AI call, mapped to the message key that names it in the activity log. */
export const AI_ACTIVITY_SOURCES = {
  ai: 'aiActivity_sourceAI',
  verifyService: 'options_verifyService',
  modelList: 'aiActivity_sourceModelList',
  autoTagging: 'tools_autoTagging',
  summarizer: 'tools_summarizer',
  reorganization: 'tools_aiReorganize',
  folderRecommendation: 'ai_folderRecommendation',
  askAI: 'askAI_title',
} as const satisfies Record<string, MessageKey>;

export type AIActivitySource = keyof typeof AI_ACTIVITY_SOURCES;

/**
 * The permission feature each source needs: Verify Service and the model list send only the API
 * key; everything else may send bookmarks or the current page.
 */
const AI_ACTIVITY_PERMISSIONS: Record<AIActivitySource, PermissionFeature> = {
  ai: 'ai',
  verifyService: 'aiProviderCheck',
  modelList: 'aiProviderCheck',
  autoTagging: 'ai',
  summarizer: 'ai',
  reorganization: 'ai',
  folderRecommendation: 'ai',
  askAI: 'ai',
};

export type AIActivityContext = {
  source: AIActivitySource;
  provider?: string;
  model?: string;
};

async function requestBodyText(input: RequestInfo | URL, init?: RequestInit) {
  if (typeof init?.body === 'string') return init.body;
  if (init?.body === undefined && input instanceof Request) {
    return input.clone().text().catch(() => undefined);
  }
  // Provider SDKs send JSON text; other bodies (streams, form data) are not recorded.
  return undefined;
}

function requestUrl(input: RequestInfo | URL): string {
  if (input instanceof Request) return input.url;
  return input.toString();
}

/**
 * Names of the extra headers configured on any AI service. They are often credentials under a
 * name no pattern recognizes (a tenant or gateway key), so their values are never recorded.
 */
async function configuredExtraHeaderNames(): Promise<string[]> {
  const configs = await aiProviderConfigValue.get().catch(() => ({}));
  return Object.values(configs).flatMap((config: StoredAIProviderConfig | undefined) => {
    const raw = config?.extraHeaders;
    if (typeof raw !== 'string' || !raw.trim()) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return isPlainObject(parsed) ? Object.keys(parsed) : [];
    } catch {
      return [];
    }
  });
}

export function createLoggingFetch(context: AIActivityContext): typeof fetch {
  return async (input, init) => {
    await assertPermission(AI_ACTIVITY_PERMISSIONS[context.source]);
    if (!(await aiActivityRecordingValue.get().catch(() => false))) {
      return fetch(input, init);
    }
    const started = performance.now();
    const request = truncateBody(await requestBodyText(input, init));
    const base = {
      ...context,
      at: Date.now(),
      method: init?.method ?? (input instanceof Request ? input.method : 'GET'),
      url: redactUrl(requestUrl(input)),
      requestHeaders: redactHeaders(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
        await configuredExtraHeaderNames(),
      ),
      requestBody: request.body,
      requestBodyOmitted: request.omitted,
    };
    try {
      const response = await fetch(input, init);
      // Read a copy, so the SDK still gets the untouched body (streams included).
      void response
        .clone()
        .text()
        .then((text) => {
          const { body, omitted } = truncateBody(text);
          return recordAIActivity({
            ...base,
            status: response.status,
            durationMs: Math.round(performance.now() - started),
            responseBody: body,
            responseBodyOmitted: omitted,
          });
        })
        .catch(() => undefined);
      return response;
    } catch (error) {
      void recordAIActivity({
        ...base,
        durationMs: Math.round(performance.now() - started),
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      });
      throw error;
    }
  };
}
