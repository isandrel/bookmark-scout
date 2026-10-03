/**
 * A fetch for AI provider SDKs and model listing that records each call in the AI activity log
 * when recording is on. It never changes the request or response, and recording failures never
 * reach the caller.
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

export function createLoggingFetch(context: AIActivityContext): typeof fetch {
  return async (input, init) => {
    if (!(await aiActivityRecordingItem.getValue().catch(() => false))) {
      return fetch(input, init);
    }
    const started = performance.now();
    const request = truncateBody(await requestBodyText(input, init));
    const base = {
      ...context,
      at: Date.now(),
      method: init?.method ?? (input instanceof Request ? input.method : 'GET'),
      url: redactUrl(requestUrl(input)),
      requestHeaders: redactHeaders(init?.headers ?? (input instanceof Request ? input.headers : undefined)),
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
