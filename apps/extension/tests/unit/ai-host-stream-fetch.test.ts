import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  AI_HOST_FETCH_PORT,
  createAIHostStreamingFetch,
  serveAIHostFetchPort,
} from '@/services/ai-host-stream-fetch';
import { portPair } from './fake-port';

const hostSender = { id: fakeBrowser.runtime.id, url: fakeBrowser.runtime.getURL('/ai-host.html') };

/** Connects the host page's fetch to a background serving `send` for the token `known`. */
function connect(send: typeof fetch, known = 'token') {
  vi.spyOn(fakeBrowser.runtime, 'connect').mockImplementation(() => {
    const [client, server] = portPair(AI_HOST_FETCH_PORT, hostSender);
    serveAIHostFetchPort(server, (token) => (token === known ? send : undefined));
    return client;
  });
}

const streamOf = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('provider requests of the AI host page, streamed through the background', () => {
  it('sends the request as given and streams the response back', async () => {
    const send = vi.fn(
      async () =>
        new Response(streamOf('data: a\n\n', 'data: b\n\n'), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
    );
    connect(send);
    const response = await createAIHostStreamingFetch('token')('https://provider.invalid/v1/chat', {
      method: 'POST',
      headers: { authorization: 'Bearer k' },
      body: '{"q":1}',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(await response.text()).toBe('data: a\n\ndata: b\n\n');
    expect(send).toHaveBeenCalledWith(
      'https://provider.invalid/v1/chat',
      expect.objectContaining({ method: 'POST', body: '{"q":1}' }),
    );
  });

  it('refuses a request for no AI call in progress', async () => {
    connect(vi.fn());
    await expect(
      createAIHostStreamingFetch('stranger')('https://provider.invalid/v1/chat'),
    ).rejects.toThrow('No AI call in progress');
  });

  it('passes a failed request on as an error', async () => {
    connect(vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(
      createAIHostStreamingFetch('token')('https://provider.invalid/v1/chat'),
    ).rejects.toThrow('Failed to fetch');
  });

  it('aborts the background request when the caller aborts', async () => {
    let seen: AbortSignal | undefined;
    connect(
      vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        seen = init?.signal ?? undefined;
        return new Promise<Response>(() => {});
      }) as unknown as typeof fetch,
    );
    const controller = new AbortController();
    const pending = createAIHostStreamingFetch('token')('https://provider.invalid/v1/chat', {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(seen).toBeDefined());
    controller.abort();
    await expect(pending).rejects.toThrow('Aborted');
    await vi.waitFor(() => expect(seen?.aborted).toBe(true));
  });
});
