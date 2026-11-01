/**
 * Provider requests of the AI host page that stream: the page cannot use the logging fetch itself
 * (Chrome gives it only the runtime API), and a one-shot message would hold an answer back until
 * it is complete. So the page opens a port per request; the background sends it through the
 * logging fetch, which records it and checks consent, and passes the response on chunk by chunk.
 * Closing the port aborts the request.
 */
import { z } from 'zod';

export const AI_HOST_FETCH_PORT = 'ai-host-fetch';

const requestSchema = z.object({
  token: z.string().min(1),
  url: z.string().url(),
  method: z.string().min(1),
  headers: z.array(z.tuple([z.string(), z.string()])),
  body: z.string().optional(),
});

type StreamMessage =
  | { type: 'head'; status: number; statusText: string; headers: [string, string][] }
  | { type: 'chunk'; data: string }
  | { type: 'end' }
  | { type: 'error'; message: string };

/**
 * The background's side: serves one request port from the AI host page, for the AI call `token`
 * names (`fetchFor` returns undefined when no such call is in progress).
 */
export function serveAIHostFetchPort(
  port: Browser.runtime.Port,
  fetchFor: (token: string) => typeof fetch | undefined,
): void {
  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());
  const post = (message: StreamMessage) => {
    try {
      port.postMessage(message);
    } catch {
      controller.abort();
    }
  };
  port.onMessage.addListener(async function onRequest(message: unknown) {
    port.onMessage.removeListener(onRequest);
    const parsed = requestSchema.safeParse(message);
    const send = parsed.success ? fetchFor(parsed.data.token) : undefined;
    if (!parsed.success || !send) {
      post({ type: 'error', message: 'No AI call in progress' });
      port.disconnect();
      return;
    }
    const { url, method, headers, body } = parsed.data;
    try {
      const response = await send(url, { method, headers, body, signal: controller.signal });
      post({
        type: 'head',
        status: response.status,
        statusText: response.statusText,
        headers: [...response.headers.entries()],
      });
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        post({ type: 'chunk', data: decoder.decode(value, { stream: true }) });
      }
      const rest = decoder.decode();
      if (rest) post({ type: 'chunk', data: rest });
      post({ type: 'end' });
    } catch (error) {
      if (!controller.signal.aborted) {
        post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    }
    port.disconnect();
  });
}

/** The AI host page's side: a fetch whose requests go through the background, streamed back. */
export function createAIHostStreamingFetch(token: string): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const body =
      request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();
    const port = browser.runtime.connect({ name: AI_HOST_FETCH_PORT });
    const encoder = new TextEncoder();
    return new Promise<Response>((resolve, reject) => {
      let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
      let settled = false;
      const stream = new ReadableStream<Uint8Array>({
        start: (streamController) => {
          controller = streamController;
        },
        cancel: () => port.disconnect(),
      });
      const fail = (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
        } else controller?.error(error);
      };
      init?.signal?.addEventListener('abort', () => {
        port.disconnect();
        fail(new DOMException('Aborted', 'AbortError'));
      });
      port.onDisconnect.addListener(() => {
        if (!settled) fail(new Error('The AI request was cut off'));
      });
      port.onMessage.addListener((message: StreamMessage) => {
        if (message.type === 'head') {
          settled = true;
          resolve(
            new Response(stream, {
              status: message.status,
              statusText: message.statusText,
              headers: message.headers,
            }),
          );
        } else if (message.type === 'chunk') {
          controller?.enqueue(encoder.encode(message.data));
        } else if (message.type === 'end') {
          controller?.close();
        } else {
          fail(new Error(message.message));
        }
      });
      port.postMessage({
        token,
        url: request.url,
        method: request.method,
        headers: [...request.headers.entries()],
        ...(body === undefined ? {} : { body }),
      } satisfies z.input<typeof requestSchema>);
    });
  };
}
