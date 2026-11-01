import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import {
  type AssistantMessageEvent,
  createModels,
  normalizeContext,
  Type,
} from '@earendil-works/pi-ai';
import {
  createRegistry,
  defineExtension,
  defineTool,
  Harness,
  MemoryStorage,
} from '@earendil-works/pi-durable';
import { simulateReadableStream, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAISdkPiProvider, toAISdkRequest } from '@/services/ai-sdk-pi-provider.lazy';

type StreamPart = Parameters<typeof simulateReadableStream>[0]['chunks'][number];
type CallOptions = Parameters<MockLanguageModelV4['doStream']>[0];

const usage = {
  inputTokens: { total: 12, noCache: 10, cacheRead: 2, cacheWrite: 0 },
  outputTokens: { total: 5, text: 3, reasoning: 2 },
};

const finish = (unified: 'stop' | 'tool-calls' | 'length') => ({
  type: 'finish',
  finishReason: { unified, raw: undefined },
  usage,
});

const textParts = (text: string) => [
  { type: 'text-start', id: 't' },
  ...text.split(' ').map((word, index) => ({
    type: 'text-delta',
    id: 't',
    delta: index === 0 ? word : ` ${word}`,
  })),
  { type: 'text-end', id: 't' },
];

/** A model that streams one scripted answer per call. */
function scripted(answers: unknown[][]) {
  const calls: CallOptions[] = [];
  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      calls.push(options);
      const chunks = answers[calls.length - 1];
      if (!chunks) throw new Error(`no answer ${calls.length}`);
      return {
        stream: simulateReadableStream({
          chunks: [{ type: 'stream-start', warnings: [] }, ...chunks] as StreamPart[],
        }),
      };
    },
  });
  return { model, calls };
}

const piModel = { id: 'm', contextWindow: 32_000, maxTokens: 1_000 };

async function collect(answers: unknown[][], context = 'Hello') {
  const { model, calls } = scripted(answers);
  const provider = createAISdkPiProvider({
    id: 'service',
    models: [piModel],
    languageModel: () => model,
  });
  const [chat] = provider.getModels();
  const events: AssistantMessageEvent[] = [];
  const stream = provider.streamSimple(
    chat,
    normalizeContext({ messages: [{ role: 'user', content: context, timestamp: 1 }] }),
  );
  for await (const event of stream) events.push(event);
  return { events, result: await stream.result(), calls };
}

describe('AI SDK models as a pi-ai provider', () => {
  it('streams text as pi-ai events, with the usage', async () => {
    const { events, result } = await collect([[...textParts('Hi there'), finish('stop')]]);
    expect(events.map((event) => event.type)).toEqual([
      'start',
      'text_start',
      'text_delta',
      'text_delta',
      'text_end',
      'done',
    ]);
    expect(result).toMatchObject({
      stopReason: 'stop',
      content: [{ type: 'text', text: 'Hi there' }],
      usage: { input: 12, output: 5, cacheRead: 2, reasoning: 2 },
    });
  });

  it('hands tool calls back without running them, and a cut-off answer as length', async () => {
    const { result } = await collect([
      [
        { type: 'tool-call', toolCallId: 'c1', toolName: 'listFolders', input: '{"depth":2}' },
        finish('tool-calls'),
      ],
    ]);
    expect(result.stopReason).toBe('toolUse');
    expect(result.content).toEqual([
      { type: 'toolCall', id: 'c1', name: 'listFolders', arguments: { depth: 2 } },
    ]);
    const cut = await collect([[...textParts('Half'), finish('length')]]);
    expect(cut.result.stopReason).toBe('length');
  });

  it('reports a failed request as an error answer', async () => {
    const { model } = scripted([]);
    const provider = createAISdkPiProvider({
      id: 'service',
      models: [piModel],
      languageModel: () => model,
    });
    const result = await provider
      .streamSimple(
        provider.getModels()[0],
        normalizeContext({ messages: [{ role: 'user', content: 'Hi', timestamp: 1 }] }),
      )
      .result();
    expect(result).toMatchObject({ stopReason: 'error', errorMessage: 'no answer 1' });
  });

  it('offers provider-run tools on every call and keeps their calls out of the transcript', async () => {
    const { model, calls } = scripted([
      [
        {
          type: 'tool-call',
          toolCallId: 'w1',
          toolName: 'webSearch',
          input: '{}',
          providerExecuted: true,
        },
        ...textParts('Found it'),
        finish('stop'),
      ],
    ]);
    const provider = createAISdkPiProvider({
      id: 'service',
      models: [piModel],
      languageModel: () => model,
      providerTools: () => ({
        webSearch: tool({ inputSchema: z.object({}), execute: async () => 'results' }),
      }),
    });
    const result = await provider
      .streamSimple(
        provider.getModels()[0],
        normalizeContext({ messages: [{ role: 'user', content: 'Search', timestamp: 1 }] }),
      )
      .result();
    expect(calls[0].tools?.map((offered) => offered.name)).toContain('webSearch');
    expect(result.content).toEqual([{ type: 'text', text: 'Found it' }]);
  });

  it('turns a transcript into one system prompt, messages, and the current tools', () => {
    const request = toAISdkRequest(
      normalizeContext({
        systemPrompt: 'Be brief.',
        tools: [
          {
            name: 'listFolders',
            description: 'List folders',
            parameters: Type.Object({ depth: Type.Number() }),
          },
        ],
        messages: [
          { role: 'user', content: 'Folders?', timestamp: 1 },
          {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'List them.' },
              { type: 'toolCall', id: 'c1', name: 'listFolders', arguments: { depth: 1 } },
            ],
            api: 'ai-sdk',
            provider: 'service',
            model: 'm',
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'toolUse',
            timestamp: 2,
          },
          {
            role: 'toolResult',
            toolCallId: 'c1',
            toolName: 'listFolders',
            content: [{ type: 'text', text: 'No such folder' }],
            isError: true,
            timestamp: 3,
          },
        ],
      }),
    );
    expect(request.system).toBe('Be brief.');
    expect(Object.keys(request.tools)).toEqual(['listFolders']);
    expect(request.messages).toEqual([
      { role: 'user', content: 'Folders?' },
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'List them.' },
          { type: 'tool-call', toolCallId: 'c1', toolName: 'listFolders', input: { depth: 1 } },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'c1',
            toolName: 'listFolders',
            output: { type: 'error-text', value: 'No such folder' },
          },
        ],
      },
    ]);
  });

  it('runs a Pi Durable tool loop end to end', async () => {
    const { model, calls } = scripted([
      [
        { type: 'tool-call', toolCallId: 'c1', toolName: 'count', input: '{"n":3}' },
        finish('tool-calls'),
      ],
      [...textParts('Counted to 3'), finish('stop')],
    ]);
    const models = createModels();
    models.setProvider(
      createAISdkPiProvider({ id: 'service', models: [piModel], languageModel: () => model }),
    );
    const count = defineTool({
      name: 'count',
      description: 'Count to n',
      parameters: Type.Object({ n: Type.Number() }),
      execute: async (args) => ({ output: [{ type: 'text', text: `1..${args.n}` }] }),
    });
    const registry = createRegistry();
    registry.install(defineExtension({ name: 'counting', tools: [count] }));
    const context = BACKGROUND_CONTEXT;
    const harness = await Harness.open(new MemoryStorage(), { models, registry }, context);
    try {
      const root = await harness.root(context, {
        agent: { model: { provider: 'service', modelId: 'm' } },
      });
      const submission = await root.submit({ type: 'input', content: 'Count to 3' }, context);
      const settled = await submission.wait(context);
      expect(settled).toMatchObject({ status: 'done' });
      // The second call saw the tool's result, which Pi Durable ran.
      expect(JSON.stringify(calls[1].prompt)).toContain('1..3');
    } finally {
      await harness.close(context);
    }
  });
});
