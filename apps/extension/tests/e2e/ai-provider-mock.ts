/**
 * A synthetic OpenAI-compatible AI service for end-to-end tests: the service the extension is set
 * up with, and the Chat Completions answer it gets. Asserts the extension's contract with the
 * SDK, not live compatibility.
 */
import type { Worker } from '@playwright/test';
import { seedAIServices, setSettings } from './storage';

export const MOCK_PROVIDER_BASE_URL = 'https://provider.invalid/v1';
export const MOCK_PROVIDER_CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
};

export async function seedMockCustomProvider(worker: Worker) {
  await setSettings(worker, { aiEnabled: true });
  await seedAIServices(worker, [
    {
      provider: 'custom',
      model: 'e2e-model',
      credentials: { apiKey: 'synthetic-e2e-key', baseUrl: MOCK_PROVIDER_BASE_URL },
    },
  ]);
}

// Minimal Chat Completions envelope, the API OpenAI-compatible providers share; asserts our
// contract with the SDK, not live compatibility.
export function mockChatCompletionBody(payload: unknown) {
  return JSON.stringify({
    id: 'chatcmpl_e2e',
    object: 'chat.completion',
    created: 0,
    model: 'e2e-model',
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: JSON.stringify(payload) },
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });
}
