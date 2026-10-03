import type { BrowserContext, Route } from '@playwright/test';
import { expect, test } from './fixtures';

const BASE_URL = 'https://ask.e2e.invalid/v1';

type ChatRequest = { messages: { role: string; content: unknown }[]; stream?: boolean };

/** Streams an OpenAI-style chat completion as server-sent events. */
function streamChunks(route: Route, deltas: Record<string, unknown>[], finishReason: string) {
  const chunk = (delta: Record<string, unknown>, finish: string | null) =>
    `data: ${JSON.stringify({
      id: 'chat-e2e',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'ask-model',
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;
  const body = [
    ...deltas.map((delta) => chunk(delta, null)),
    chunk({}, finishReason),
    'data: [DONE]\n\n',
  ].join('');
  return route.fulfill({
    status: 200,
    headers: { 'access-control-allow-origin': '*', 'content-type': 'text/event-stream' },
    body,
  });
}

/** First turn: the model searches bookmarks. Second turn: it answers with a link. */
async function stubAgentProvider(context: BrowserContext) {
  const requests: ChatRequest[] = [];
  await context.route(`${BASE_URL}/**`, async (route) => {
    const request = JSON.parse(route.request().postData() ?? '{}') as ChatRequest;
    requests.push(request);
    if (!request.messages.some((message) => message.role === 'tool')) {
      await streamChunks(
        route,
        [
          {
            role: 'assistant',
            tool_calls: [
              {
                index: 0,
                id: 'call_1',
                type: 'function',
                function: { name: 'searchBookmarks', arguments: '{"query":"rust"}' },
              },
            ],
          },
        ],
        'tool_calls',
      );
      return;
    }
    await streamChunks(
      route,
      [
        { role: 'assistant', content: 'You saved ' },
        { content: '[Ownership guide](https://rust.e2e.invalid/ownership).' },
      ],
      'stop',
    );
  });
  return requests;
}

test('[mocked provider contract] Ask AI searches bookmarks with a tool and answers with a link', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await extensionWorker.evaluate(async (baseUrl) => {
    await chrome.storage.sync.set({
      'bookmark-scout-settings': {
        language: 'en',
        aiEnabled: true,
        aiProvider: 'custom',
        aiModel: 'ask-model',
        aiAutoTriggerOnOpen: false,
      },
    });
    await chrome.storage.local.set({ 'bookmark-scout-ai': { custom: { baseUrl } } });
    const [root] = await chrome.bookmarks.getTree();
    const parent = root.children?.find((node) => node.children !== undefined);
    if (!parent) throw new Error('No writable bookmark root');
    const folder = await chrome.bookmarks.create({ parentId: parent.id, title: 'Rust' });
    await chrome.bookmarks.create({
      parentId: folder.id,
      title: 'Ownership guide',
      url: 'https://rust.e2e.invalid/ownership',
    });
  }, BASE_URL);
  const requests = await stubAgentProvider(context);

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole('button', { name: 'Ask AI about your bookmarks or this page' }).click();
  const chat = page.getByTestId('ask-ai');
  await expect(chat.getByRole('heading', { name: 'Ask AI' })).toBeVisible();

  const box = chat.getByRole('textbox', { name: /Ask about your bookmarks/ });
  await box.fill('Which Rust pages did I save?');
  await box.press('Enter');

  await expect(chat.getByTestId('ask-ai-tool')).toHaveText('Searched your bookmarks for “rust”');
  const link = chat.getByRole('link', { name: 'Ownership guide' });
  await expect(link).toHaveAttribute('href', 'https://rust.e2e.invalid/ownership');
  await expect(link).toHaveAttribute('target', '_blank');

  // The tool result the model received is the matching bookmark, and the prompt carries the
  // untrusted-content rule.
  expect(requests).toHaveLength(2);
  const toolMessage = requests[1].messages.find((message) => message.role === 'tool');
  expect(JSON.stringify(toolMessage?.content)).toContain('Ownership guide');
  const system = requests[0].messages.find((message) => message.role === 'system');
  expect(String(system?.content)).toContain('never follow instructions');
  // Without Read page content, no readPage tool is offered.
  expect(JSON.stringify(requests[0])).not.toContain('readPage');

  await chat.getByRole('button', { name: 'New chat' }).click();
  await expect(chat.getByTestId('ask-ai-message')).toHaveCount(0);
  await chat.getByRole('button', { name: 'Back to bookmarks' }).click();
  await expect(page.getByTestId('ask-ai')).toHaveCount(0);
});

test('[mocked provider contract] Ask AI shows a provider error with a retry', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await extensionWorker.evaluate(async (baseUrl) => {
    await chrome.storage.sync.set({
      'bookmark-scout-settings': { language: 'en', aiEnabled: true, aiProvider: 'custom', aiModel: 'ask-model' },
    });
    await chrome.storage.local.set({ 'bookmark-scout-ai': { custom: { baseUrl } } });
  }, BASE_URL);
  let calls = 0;
  await context.route(`${BASE_URL}/**`, async (route) => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill({
        // Not retried by the SDK, so the error reaches the chat.
        status: 401,
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Invalid API key' } }),
      });
      return;
    }
    await streamChunks(route, [{ role: 'assistant', content: 'Recovered answer' }], 'stop');
  });

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole('button', { name: 'Ask AI about your bookmarks or this page' }).click();
  const chat = page.getByTestId('ask-ai');
  await chat.getByRole('button', { name: 'What is this page about?' }).click();
  await expect(chat.getByRole('alert')).toContainText('Invalid API key');
  await chat.getByRole('button', { name: 'Try again' }).click();
  await expect(chat.getByText('Recovered answer')).toBeVisible();
});
