/**
 * A streaming AI SDK model that plays scripted answers, one per call, for code that streams
 * (Ask AI on Pi Durable). Each answer is a list of stream parts; `textParts`, `toolCallPart`, and
 * `finishPart` build the common ones.
 */
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

type StreamPart = Parameters<typeof simulateReadableStream>[0]['chunks'][number];
export type StreamCallOptions = Parameters<MockLanguageModelV4['doStream']>[0];

const usage = {
  inputTokens: { total: 12, noCache: 10, cacheRead: 2, cacheWrite: 0 },
  outputTokens: { total: 5, text: 3, reasoning: 2 },
};

export const finishPart = (unified: 'stop' | 'tool-calls' | 'length') => ({
  type: 'finish',
  finishReason: { unified, raw: undefined },
  usage,
});

export const textParts = (text: string) => [
  { type: 'text-start', id: 't' },
  ...text.split(' ').map((word, index) => ({
    type: 'text-delta',
    id: 't',
    delta: index === 0 ? word : ` ${word}`,
  })),
  { type: 'text-end', id: 't' },
];

export const toolCallPart = (toolName: string, input: object, toolCallId = `call-${toolName}`) => ({
  type: 'tool-call',
  toolCallId,
  toolName,
  input: JSON.stringify(input),
});

/** A model that streams `answers[n]` on its nth call; a step may build its answer from the call. */
export function scriptedStreamModel(
  answers: (unknown[] | ((call: StreamCallOptions) => unknown[]))[],
) {
  const calls: StreamCallOptions[] = [];
  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      calls.push(options);
      const step = answers[calls.length - 1];
      if (!step) throw new Error(`no answer ${calls.length}`);
      const chunks = typeof step === 'function' ? step(options) : step;
      return {
        stream: simulateReadableStream({
          chunks: [{ type: 'stream-start', warnings: [] }, ...chunks] as StreamPart[],
        }),
      };
    },
  });
  return { model, calls };
}
