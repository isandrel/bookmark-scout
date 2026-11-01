/**
 * A pi-ai provider whose chat streams come from an AI SDK model, so Pi Durable runs Ask AI's tool
 * loop while every model request still goes through the AI SDK: its providers, the logging fetch,
 * Chrome's built-in AI, and provider-run web search. Pi Durable hands over its transcript; this
 * turns it into AI SDK messages, makes one model call without running tools (Pi Durable runs
 * them), and streams the answer back as pi-ai events. Like every `*.lazy.ts` file it is left out
 * of auto-imports; import it only with `import()` or from another lazy module.
 */
import {
  type AssistantMessage,
  type AssistantMessageEventStream,
  collapseSystemMessages,
  createAssistantMessageEventStream,
  createProvider,
  getCurrentTools,
  getSystemMessageText,
  type Message,
  type Model,
  type Provider,
  type SimpleStreamOptions,
  type StopReason,
  type ToolCall,
  type TranscriptContext,
} from '@earendil-works/pi-ai';
import {
  type AssistantContent,
  type FinishReason,
  jsonSchema,
  type LanguageModel,
  type LanguageModelUsage,
  type ModelMessage,
  streamText,
  type ToolSet,
  tool,
} from 'ai';
import { SOURCES_DIAGNOSTIC } from '@/lib/ask-ai-ui-messages';

/** The diagnostic an answer carries for each tool the provider ran itself, such as its web search. */
export const PROVIDER_TOOL_DIAGNOSTIC = 'provider_tool';

/** The diagnostic an answer carries for each tool the provider ran itself, such as its web search. */
export const PROVIDER_TOOL_DIAGNOSTIC = 'provider_tool';

/** The pi-ai api name of models served through the AI SDK. */
export const AI_SDK_API = 'ai-sdk';

/** What Pi Durable needs to know about a model to budget its context. */
export type AISdkPiModel = {
  id: string;
  name?: string;
  contextWindow: number;
  maxTokens: number;
  reasoning?: boolean;
};

export type AISdkPiProviderOptions = {
  /** The pi-ai provider id; conversations store it with the model id. */
  id: string;
  name?: string;
  models: readonly AISdkPiModel[];
  /** The AI SDK model for a model id, built per call so a changed service applies at once. */
  languageModel: (modelId: string) => LanguageModel | Promise<LanguageModel>;
  /** A failed request's message as the user should read it; the raw error message without it. */
  describeError?: (error: unknown) => string;
  /**
   * Tools the provider runs itself, such as its web search: offered on every call, never handed
   * to Pi Durable as calls to run.
   */
  providerTools?: () => ToolSet | Promise<ToolSet>;
};

/** One part of an AI SDK assistant message. */
type AssistantPart = Exclude<AssistantContent, string>[number];

const FINISH_REASONS: Partial<Record<FinishReason, StopReason>> = {
  stop: 'stop',
  length: 'length',
  'tool-calls': 'toolUse',
};

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };

/** pi-ai usage from the AI SDK's; cost stays zero, since the extension prices nothing. */
function toUsage(usage: LanguageModelUsage | undefined): AssistantMessage['usage'] {
  return {
    input: usage?.inputTokens ?? 0,
    output: usage?.outputTokens ?? 0,
    cacheRead: usage?.inputTokenDetails?.cacheReadTokens ?? 0,
    cacheWrite: usage?.inputTokenDetails?.cacheWriteTokens ?? 0,
    ...(usage?.outputTokenDetails?.reasoningTokens === undefined
      ? {}
      : { reasoning: usage.outputTokenDetails.reasoningTokens }),
    totalTokens: usage?.totalTokens ?? 0,
    cost: { ...ZERO_COST },
  };
}

/** One transcript message as AI SDK messages; system messages are folded in beforehand. */
function toModelMessages(message: Message): ModelMessage[] {
  switch (message.role) {
    case 'user':
      return [
        {
          role: 'user',
          content:
            typeof message.content === 'string'
              ? message.content
              : message.content.map((part) =>
                  part.type === 'text'
                    ? { type: 'text' as const, text: part.text }
                    : { type: 'image' as const, image: part.data, mediaType: part.mimeType },
                ),
        },
      ];
    case 'assistant': {
      const content = message.content.flatMap<AssistantPart>((part) => {
        if (part.type === 'text')
          return part.text ? [{ type: 'text' as const, text: part.text }] : [];
        if (part.type === 'thinking') {
          return part.thinking && !part.redacted
            ? [{ type: 'reasoning' as const, text: part.thinking }]
            : [];
        }
        return [
          {
            type: 'tool-call' as const,
            toolCallId: part.id,
            toolName: part.name,
            input: part.arguments,
          },
        ];
      });
      return content.length > 0 ? [{ role: 'assistant', content }] : [];
    }
    case 'toolResult': {
      const value = message.content
        .flatMap((part) => (part.type === 'text' ? [part.text] : []))
        .join('\n');
      return [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: message.toolCallId,
              toolName: message.toolName,
              output: message.isError ? { type: 'error-text', value } : { type: 'text', value },
            },
          ],
        },
      ];
    }
    case 'system':
      return [];
  }
}

/** The AI SDK request for a transcript: one system prompt, the messages, and the tools offered. */
export function toAISdkRequest(context: TranscriptContext): {
  system: string | undefined;
  messages: ModelMessage[];
  tools: ToolSet;
} {
  const collapsed = collapseSystemMessages(context);
  const system = collapsed.messages.find((message) => message.role === 'system');
  const tools: ToolSet = Object.fromEntries(
    getCurrentTools(context.messages).map((definition) => [
      definition.name,
      // No `execute`: the AI SDK returns the call, and Pi Durable runs it.
      tool({
        description: definition.description,
        inputSchema: jsonSchema(definition.parameters as Parameters<typeof jsonSchema>[0]),
      }),
    ]),
  );
  return {
    system: system ? getSystemMessageText(system) || undefined : undefined,
    messages: collapsed.messages.flatMap(toModelMessages),
    tools,
  };
}

function streamWith(options: AISdkPiProviderOptions) {
  return (
    model: Model<string>,
    context: TranscriptContext,
    streamOptions: SimpleStreamOptions = {},
  ): AssistantMessageEventStream => {
    const stream = createAssistantMessageEventStream();
    const partial: AssistantMessage = {
      role: 'assistant',
      content: [],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: toUsage(undefined),
      stopReason: 'pending',
      timestamp: Date.now(),
    };
    void (async () => {
      const blocks = new Map<string, number>();
      const sources: { url: string; title?: string }[] = [];
      stream.push({ type: 'start', partial });
      try {
        const request = toAISdkRequest(context);
        const [languageModel, providerTools] = await Promise.all([
          options.languageModel(model.id),
          options.providerTools?.() ?? {},
        ]);
        const result = streamText({
          model: languageModel,
          system: request.system,
          messages: request.messages,
          tools: { ...request.tools, ...providerTools },
          abortSignal: streamOptions.signal,
          // Pi Durable retries a failed request on its own schedule.
          maxRetries: 0,
        });
        for await (const part of result.fullStream) {
          switch (part.type) {
            case 'text-start':
            case 'reasoning-start': {
              partial.content.push(
                part.type === 'text-start'
                  ? { type: 'text', text: '' }
                  : { type: 'thinking', thinking: '' },
              );
              const contentIndex = partial.content.length - 1;
              blocks.set(part.id, contentIndex);
              stream.push({
                type: part.type === 'text-start' ? 'text_start' : 'thinking_start',
                contentIndex,
                partial,
              });
              break;
            }
            case 'text-delta':
            case 'reasoning-delta': {
              const contentIndex = blocks.get(part.id);
              const block = contentIndex === undefined ? undefined : partial.content[contentIndex];
              if (contentIndex === undefined || !block) break;
              if (block.type === 'text') block.text += part.text;
              else if (block.type === 'thinking') block.thinking += part.text;
              stream.push({
                type: block.type === 'text' ? 'text_delta' : 'thinking_delta',
                contentIndex,
                delta: part.text,
                partial,
              });
              break;
            }
            case 'text-end':
            case 'reasoning-end': {
              const contentIndex = blocks.get(part.id);
              const block = contentIndex === undefined ? undefined : partial.content[contentIndex];
              if (contentIndex === undefined || !block) break;
              if (block.type === 'text') {
                stream.push({ type: 'text_end', contentIndex, content: block.text, partial });
              } else if (block.type === 'thinking') {
                stream.push({
                  type: 'thinking_end',
                  contentIndex,
                  content: block.thinking,
                  partial,
                });
              }
              break;
            }
            case 'tool-call': {
              // The provider ran its own tool (web search): its answer comes as text, and the
              // diagnostic records that unreviewed text came in.
              if (part.providerExecuted) {
                partial.diagnostics = [
                  ...(partial.diagnostics ?? []),
                  {
                    type: PROVIDER_TOOL_DIAGNOSTIC,
                    timestamp: Date.now(),
                    details: { toolName: part.toolName },
                  },
                ];
                break;
              }
              const call: ToolCall = {
                type: 'toolCall',
                id: part.toolCallId,
                name: part.toolName,
                arguments: (part.input ?? {}) as ToolCall['arguments'],
              };
              partial.content.push(call);
              const contentIndex = partial.content.length - 1;
              stream.push({ type: 'toolcall_start', contentIndex, partial });
              stream.push({ type: 'toolcall_end', contentIndex, toolCall: call, partial });
              break;
            }
            case 'finish':
              partial.usage = toUsage(part.totalUsage);
              partial.stopReason = partial.content.some((block) => block.type === 'toolCall')
                ? 'toolUse'
                : (FINISH_REASONS[part.finishReason] ?? 'stop');
              break;
            case 'source':
              if (part.sourceType === 'url') {
                sources.push({ url: part.url, ...(part.title ? { title: part.title } : {}) });
              }
              break;
            case 'error':
              throw part.error;
            case 'abort':
              throw new DOMException(part.reason ?? 'Aborted', 'AbortError');
            default:
              break;
          }
        }
        if (sources.length > 0) {
          partial.diagnostics = [
            ...(partial.diagnostics ?? []),
            { type: SOURCES_DIAGNOSTIC, timestamp: Date.now(), details: { sources } },
          ];
        }
        const reason = partial.stopReason;
        if (reason !== 'stop' && reason !== 'length' && reason !== 'toolUse') {
          partial.stopReason = 'stop';
        }
        stream.push({
          type: 'done',
          reason: partial.stopReason as 'stop' | 'length' | 'toolUse',
          message: partial,
        });
      } catch (error) {
        const reason = streamOptions.signal?.aborted ? 'aborted' : 'error';
        partial.stopReason = reason;
        partial.errorMessage =
          options.describeError?.(error) ??
          (error instanceof Error ? error.message : String(error));
        stream.push({ type: 'error', reason, error: partial });
      }
    })();
    return stream;
  };
}

/** A pi-ai provider over AI SDK models; the AI SDK model carries its own key and fetch. */
export function createAISdkPiProvider(options: AISdkPiProviderOptions): Provider {
  const stream = streamWith(options);
  return createProvider({
    id: options.id,
    name: options.name ?? options.id,
    // pi-ai only asks whether the provider is set up; the AI SDK model holds the key.
    auth: { apiKey: { name: options.id, resolve: async () => ({ auth: {} }) } },
    models: options.models.map((entry) => ({
      id: entry.id,
      name: entry.name ?? entry.id,
      api: AI_SDK_API,
      provider: options.id,
      baseUrl: '',
      input: ['text'],
      reasoning: entry.reasoning ?? false,
      contextWindow: entry.contextWindow,
      maxTokens: entry.maxTokens,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    })),
    api: { stream, streamSimple: stream },
  });
}
