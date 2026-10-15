/**
 * Chrome's built-in model (the Prompt API's `LanguageModel`) as an AI SDK language model, so
 * `generateObject` and every other AI SDK call work with it like with a hosted provider. One
 * session per call, destroyed afterwards: a new one, or a copy of a warm session (`openSession`,
 * AI quick save's host page). A structured call's JSON schema goes to the model as
 * `responseConstraint`, which Chrome enforces while the model writes; the prompt itself must
 * describe the format, since `omitResponseConstraintInput` keeps the schema out of the small
 * context. Sampling options are left at Chrome's defaults (temperature and topK are deprecated,
 * and passing them with `samplingMode` is a TypeError).
 *
 * It never downloads the model: a call while the model is not `available` fails at once, so a
 * click in the popup cannot start a multi-gigabyte download (Options does that on purpose).
 * Nothing goes over the network, so the logging fetch never sees these calls; `onCall` reports
 * each one for the AI activity log instead. Loaded by ai-client.lazy.ts only, never statically.
 */

import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  SharedV4Warning,
} from '@ai-sdk/provider';

export type BuiltinModelOptions = {
  modelId: string;
  /** Called after every call, successful or not; it must not throw. */
  onCall?: (call: BuiltinModelCall) => void;
  /**
   * Opens the session for a call that starts from the system prompt alone, such as a copy of a
   * warm session in AI quick save's host page; other calls, and every call without it, create a
   * fresh session.
   */
  openSession?: BuiltinSessionOpener;
};

/** The adapter's provider name in AI SDK errors and results. */
const PROVIDER_NAME = 'chrome_builtin';

/** A session's starting messages: the system prompt first, then earlier turns. */
type InitialPrompts = NonNullable<LanguageModelCreateOptions['initialPrompts']>;

type SessionInput = {
  initialPrompts: InitialPrompts;
  /** The system prompt, when it is the only message before the user's. */
  systemOnly?: string;
  input: string;
  promptOptions: LanguageModelPromptOptions;
  /** The whole prompt as text, for the activity log. */
  transcript: string;
};

function toSessionInput(
  options: LanguageModelV4CallOptions,
  warnings: SharedV4Warning[],
): SessionInput {
  if (options.tools?.length) warnings.push({ type: 'unsupported', feature: 'tools' });
  const system: string[] = [];
  const turns: LanguageModelMessage[] = [];
  for (const message of options.prompt satisfies LanguageModelV4Prompt) {
    if (message.role === 'system') {
      system.push(message.content);
      continue;
    }
    if (message.role === 'tool') {
      warnings.push({ type: 'other', message: 'tool results are not sent to the built-in model' });
      continue;
    }
    const text = message.content.flatMap((part) => (part.type === 'text' ? [part.text] : []));
    turns.push({ role: message.role, content: text.join('\n') });
  }
  const last = turns.pop();
  if (last?.role !== 'user' || typeof last.content !== 'string') {
    throw new Error(t('builtinAi_errorNoPrompt'));
  }
  const promptOptions: LanguageModelPromptOptions = { signal: options.abortSignal };
  if (options.responseFormat?.type === 'json' && options.responseFormat.schema) {
    // Chrome rejects the `$schema` keyword the AI SDK adds.
    const { $schema: _ignored, ...schema } = options.responseFormat.schema as Record<
      string,
      unknown
    >;
    promptOptions.responseConstraint = schema;
    promptOptions.omitResponseConstraintInput = true;
  }
  const systemText = system.join('\n\n');
  const initialPrompts: InitialPrompts = systemText
    ? [{ role: 'system', content: systemText }, ...turns]
    : turns;
  return {
    initialPrompts,
    ...(systemText && turns.length === 0 ? { systemOnly: systemText } : {}),
    input: last.content,
    promptOptions,
    transcript: [...initialPrompts, last]
      .map((message) => `${message.role}: ${String(message.content)}`)
      .join('\n\n'),
  };
}

/** Chrome counts only the session's whole context, prompts and answer together. */
const contextUsage = (session: LanguageModel) => ({
  inputTokens: {
    total: session.contextUsage,
    noCache: session.contextUsage,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
});

const describeError = (error: unknown) =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/** The built-in model as an AI SDK language model (specification v4). */
export function createBuiltinModel({
  modelId,
  onCall,
  openSession,
}: BuiltinModelOptions): LanguageModelV4 {
  // Both fail without downloading anything when the model is not ready.
  const sessionFor = (request: SessionInput, signal: AbortSignal | undefined) =>
    openSession && request.systemOnly !== undefined
      ? openSession(request.systemOnly, signal)
      : createBuiltinSession(request.initialPrompts, signal);
  const report = (call: BuiltinModelCall) => {
    try {
      onCall?.(call);
    } catch {
      // Logging never breaks the call.
    }
  };

  return {
    specificationVersion: 'v4',
    provider: PROVIDER_NAME,
    modelId,
    supportedUrls: {},

    async doGenerate(options): Promise<LanguageModelV4GenerateResult> {
      const warnings: SharedV4Warning[] = [];
      const started = performance.now();
      const request = toSessionInput(options, warnings);
      const elapsed = () => Math.round(performance.now() - started);
      let session: LanguageModel | undefined;
      try {
        session = await sessionFor(request, options.abortSignal);
        const text = await session.prompt(request.input, request.promptOptions);
        report({ input: request.transcript, output: text, durationMs: elapsed() });
        return {
          content: [{ type: 'text', text }],
          finishReason: { unified: 'stop', raw: undefined },
          usage: contextUsage(session),
          warnings,
        };
      } catch (error) {
        report({ input: request.transcript, error: describeError(error), durationMs: elapsed() });
        throw error;
      } finally {
        session?.destroy();
      }
    },

    async doStream(options) {
      const warnings: SharedV4Warning[] = [];
      const started = performance.now();
      const request = toSessionInput(options, warnings);
      const session = await sessionFor(request, options.abortSignal);
      const reader = session.promptStreaming(request.input, request.promptOptions).getReader();
      let output = '';
      const finish = (error?: unknown) => {
        session.destroy();
        report({
          input: request.transcript,
          ...(error === undefined ? { output } : { error: describeError(error) }),
          durationMs: Math.round(performance.now() - started),
        });
      };
      const stream = new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings });
          controller.enqueue({ type: 'text-start', id: '0' });
        },
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (!done) {
              output += value;
              controller.enqueue({ type: 'text-delta', id: '0', delta: value });
              return;
            }
            controller.enqueue({ type: 'text-end', id: '0' });
            controller.enqueue({
              type: 'finish',
              finishReason: { unified: 'stop', raw: undefined },
              usage: contextUsage(session),
            });
            finish();
            controller.close();
          } catch (error) {
            finish(error);
            controller.error(error);
          }
        },
        cancel() {
          void reader.cancel();
          finish(new DOMException('', 'AbortError'));
        },
      });
      return { stream };
    },
  };
}
