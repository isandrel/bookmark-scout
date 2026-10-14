import { generateText, Output, streamText, tool } from 'ai';
import { createOllama } from 'ollama-ai-provider-v2';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// Exercise the installed SDKs together. Only HTTP is stubbed: these checks protect the
// provider-utils deduplication rather than replacing the provider/AI SDK with mocks.
const response = (message: Record<string, unknown>, done = true) => ({
  model: 'synthetic-model',
  created_at: '2026-10-14T00:00:00Z',
  message: { role: 'assistant', content: '', ...message },
  done,
  ...(done ? { done_reason: 'stop', prompt_eval_count: 2, eval_count: 3 } : {}),
});

function provider(body: unknown, contentType = 'application/json', status = 200) {
  const transport = vi.fn<typeof fetch>(
    async () =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': contentType },
      }),
  );
  const model = createOllama({
    baseURL: 'https://ollama.invalid/api',
    headers: { 'X-Synthetic-Contract': 'check' },
    fetch: transport,
  })('synthetic-model');
  return { model, transport };
}

describe('[HTTP-stubbed real SDK contract] Ollama shared provider utilities', () => {
  it('keeps structured output, endpoint, model and custom headers', async () => {
    const { model, transport } = provider(response({ content: '{"tags":["reference"]}' }));
    const result = await generateText({
      model,
      output: Output.object({ schema: z.object({ tags: z.array(z.string()) }) }),
      prompt: 'Tag the synthetic bookmark.',
      maxRetries: 0,
    });
    expect(result.output).toEqual({ tags: ['reference'] });
    const [url, init] = transport.mock.calls[0];
    expect(String(url)).toBe('https://ollama.invalid/api/chat');
    expect(new Headers(init?.headers).get('X-Synthetic-Contract')).toBe('check');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'synthetic-model',
      stream: false,
      format: { type: 'object', properties: { tags: { type: 'array' } } },
    });
  });

  it('keeps streamed text and reasoning deltas', async () => {
    const body = [
      response({ thinking: 'Consider the bookmark.' }, false),
      response({ content: 'Reference' }, false),
      response({ content: '' }),
    ]
      .map((chunk) => JSON.stringify(chunk))
      .join('\n');
    const { model, transport } = provider(`${body}\n`, 'application/x-ndjson');
    const result = streamText({ model, prompt: 'Read a synthetic bookmark.', maxRetries: 0 });
    const parts = [];
    for await (const part of result.fullStream) parts.push(part);
    expect(await result.text).toBe('Reference');
    expect(await result.reasoningText).toBe('Consider the bookmark.');
    expect(parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text-delta', text: 'Reference' }),
        expect.objectContaining({ type: 'reasoning-delta', text: 'Consider the bookmark.' }),
      ]),
    );
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body)).stream).toBe(true);
  });

  it('keeps tool-call names and validated arguments', async () => {
    const { model } = provider(
      response({
        tool_calls: [{ function: { name: 'findBookmark', arguments: { query: 'reference' } } }],
      }),
    );
    const result = await generateText({
      model,
      prompt: 'Find a synthetic bookmark.',
      tools: {
        findBookmark: tool({
          description: 'Search synthetic bookmarks.',
          inputSchema: z.object({ query: z.string() }),
        }),
      },
      maxRetries: 0,
    });
    expect(result.toolCalls).toEqual([
      expect.objectContaining({ toolName: 'findBookmark', input: { query: 'reference' } }),
    ]);
    expect(result.finishReason).toBe('tool-calls');
  });

  it('keeps HTTP errors available for provider error handling', async () => {
    const { model, transport } = provider(
      { error: 'Synthetic rate limit.' },
      'application/json',
      429,
    );
    await expect(
      generateText({ model, prompt: 'Synthetic request.', maxRetries: 0 }),
    ).rejects.toMatchObject({
      name: 'AI_APICallError',
      statusCode: 429,
      responseBody: JSON.stringify({ error: 'Synthetic rate limit.' }),
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
