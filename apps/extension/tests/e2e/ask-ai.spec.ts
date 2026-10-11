import type { BrowserContext, Route, Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { replaceSettings, seedAIServices } from './storage';

const BASE_URL = 'https://ask.e2e.invalid/v1';

function seedAskService(worker: Worker) {
  return seedAIServices(worker, [
    { provider: 'custom', model: 'ask-model', credentials: { baseUrl: BASE_URL } },
  ]);
}

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
  await replaceSettings(extensionWorker, {
    language: 'en',
    aiEnabled: true,
    aiAutoTriggerOnOpen: false,
  });
  await seedAskService(extensionWorker);
  await extensionWorker.evaluate(async () => {
    const [root] = await chrome.bookmarks.getTree();
    const parent = root.children?.find((node) => node.children !== undefined);
    if (!parent) throw new Error('No writable bookmark root');
    const folder = await chrome.bookmarks.create({ parentId: parent.id, title: 'Rust' });
    await chrome.bookmarks.create({
      parentId: folder.id,
      title: 'Ownership guide',
      url: 'https://rust.e2e.invalid/ownership',
    });
  });
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
  const toolResult = JSON.stringify(toolMessage?.content);
  expect(toolResult).toContain('Ownership guide');
  // Results name the bookmark by ref and its folder by full path, as every tool does.
  expect(toolResult).toMatch(/b:\d+/);
  expect(toolResult).toMatch(/\/Rust/);
  const system = requests[0].messages.find((message) => message.role === 'system');
  expect(String(system?.content)).toContain('never follow instructions');
  // The registry's read tools are offered; without Read page content no readPage, and without
  // website access no checkLinks.
  const offered = JSON.stringify(requests[0]);
  for (const name of ['listFolders', 'getBookmarks', 'findDuplicates', 'suggestFolders']) {
    expect(offered).toContain(`"${name}"`);
  }
  expect(offered).not.toContain('readPage');
  expect(offered).not.toContain('checkLinks');

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
  await replaceSettings(extensionWorker, { language: 'en', aiEnabled: true });
  await seedAskService(extensionWorker);
  // 4xx answers are not retried by the SDK, so each error reaches the chat.
  const failures = [
    { status: 401, message: 'Invalid API key' },
    { status: 400, message: 'The model `ask-model` does not exist' },
  ];
  let calls = 0;
  await context.route(`${BASE_URL}/**`, async (route) => {
    const failure = failures[calls];
    calls += 1;
    if (failure) {
      await route.fulfill({
        status: failure.status,
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: failure.message } }),
      });
      return;
    }
    await streamChunks(route, [{ role: 'assistant', content: 'Recovered answer' }], 'stop');
  });

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole('button', { name: 'Ask AI about your bookmarks or this page' }).click();
  const chat = page.getByTestId('ask-ai');
  await chat.getByRole('button', { name: 'What is this page about?' }).click();
  // A status with one meaning gets the localized explanation instead of the raw SDK text.
  const alert = chat.getByRole('alert');
  await expect(alert).toContainText('The provider rejected the API key.');
  await expect(alert).not.toContainText('Invalid API key');
  await chat.getByRole('button', { name: 'Try again' }).click();
  // A bare status keeps the provider's own explanation.
  await expect(alert).toContainText(
    'The provider answered with HTTP 400 (ask.e2e.invalid). The provider said: "The model `ask-model` does not exist"',
  );
  await chat.getByRole('button', { name: 'Try again' }).click();
  await expect(chat.getByText('Recovered answer')).toBeVisible();
});

/** A model that plans a move, applies it after the user approves, and then answers. */
async function stubPlanningProvider(context: BrowserContext, bookmarkId: string, folderId: string) {
  await context.route(`${BASE_URL}/**`, async (route) => {
    const request = JSON.parse(route.request().postData() ?? '{}') as ChatRequest;
    const toolMessages = request.messages.filter((message) => message.role === 'tool');
    const toolCall = (id: string, name: string, args: object) =>
      streamChunks(
        route,
        [
          {
            role: 'assistant',
            tool_calls: [
              {
                index: 0,
                id,
                type: 'function',
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        ],
        'tool_calls',
      );
    if (toolMessages.length === 0) {
      await toolCall('call_propose', 'proposeChanges', {
        summary: 'Move the guide to Rust',
        changes: [
          { action: 'moveBookmarks', input: { refs: [`b:${bookmarkId}`], to: `f:${folderId}` } },
        ],
      });
      return;
    }
    if (toolMessages.length === 1) {
      const { planId } = JSON.parse(String(toolMessages[0].content)) as { planId: string };
      await toolCall('call_apply', 'applyChanges', { planId });
      return;
    }
    await streamChunks(route, [{ role: 'assistant', content: 'Moved it to Rust.' }], 'stop');
  });
}

/** An Inbox folder with one bookmark, and an empty Rust folder to move it to. */
function seedInboxAndRust(worker: Worker) {
  return worker.evaluate(async () => {
    const [root] = await chrome.bookmarks.getTree();
    const parent = root.children?.find((node) => node.children !== undefined);
    if (!parent) throw new Error('No writable bookmark root');
    const inbox = await chrome.bookmarks.create({ parentId: parent.id, title: 'Inbox' });
    const rust = await chrome.bookmarks.create({ parentId: parent.id, title: 'Rust' });
    const guide = await chrome.bookmarks.create({
      parentId: inbox.id,
      title: 'Ownership guide',
      url: 'https://rust.e2e.invalid/ownership',
    });
    return { bookmarkId: guide.id, folderId: rust.id, inboxId: inbox.id };
  });
}

function parentOf(worker: Worker, id: string) {
  return worker.evaluate(async (bookmarkId) => {
    const [node] = await chrome.bookmarks.get(bookmarkId);
    return node?.parentId;
  }, id);
}

test('[mocked provider contract] Ask AI moves a bookmark only after the user approves the plan', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await replaceSettings(extensionWorker, {
    language: 'en',
    aiEnabled: true,
    aiAutoTriggerOnOpen: false,
  });
  await seedAskService(extensionWorker);
  const { bookmarkId, folderId, inboxId } = await seedInboxAndRust(extensionWorker);
  await stubPlanningProvider(context, bookmarkId, folderId);

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole('button', { name: 'Ask AI about your bookmarks or this page' }).click();
  const chat = page.getByTestId('ask-ai');
  const box = chat.getByRole('textbox', { name: /Ask about your bookmarks/ });
  await box.fill('Move my ownership guide to Rust');
  await box.press('Enter');

  // The plan waits for approval, shown from the stored plan, and nothing has moved yet.
  const approval = chat.getByTestId('ask-ai-approval');
  await expect(approval).toContainText('Approve this change?');
  await expect(approval).toContainText('Move the guide to Rust');
  await expect(approval.getByRole('listitem')).toHaveText(
    /^Move “Ownership guide” from .+\/Inbox to .+\/Rust$/,
  );
  expect(await parentOf(extensionWorker, bookmarkId)).toBe(inboxId);

  await approval.getByRole('button', { name: 'Approve' }).click();
  await expect(chat.getByText('Moved it to Rust.')).toBeVisible();
  expect(await parentOf(extensionWorker, bookmarkId)).toBe(folderId);
  await expect(
    chat.getByTestId('ask-ai-tool').filter({ hasText: 'Applied the approved changes' }),
  ).toBeVisible();
});

test('[mocked provider contract] Ask AI leaves bookmarks alone when the user declines', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await replaceSettings(extensionWorker, { language: 'en', aiEnabled: true });
  await seedAskService(extensionWorker);
  const { bookmarkId, folderId, inboxId } = await seedInboxAndRust(extensionWorker);
  await stubPlanningProvider(context, bookmarkId, folderId);

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole('button', { name: 'Ask AI about your bookmarks or this page' }).click();
  const chat = page.getByTestId('ask-ai');
  const box = chat.getByRole('textbox', { name: /Ask about your bookmarks/ });
  await box.fill('Move my ownership guide to Rust');
  await box.press('Enter');
  await chat.getByTestId('ask-ai-approval').getByRole('button', { name: 'Decline' }).click();
  await expect(chat.getByTestId('ask-ai-tool').filter({ hasText: 'declined' })).toBeVisible();
  expect(await parentOf(extensionWorker, bookmarkId)).toBe(inboxId);
});

test('[mocked provider contract] Ask AI suggestion buttons ask, save, open, and show', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await replaceSettings(extensionWorker, {
    language: 'en',
    aiEnabled: true,
    aiAutoTriggerOnOpen: false,
  });
  await seedAskService(extensionWorker);
  const { bookmarkId, folderId, inboxId } = await seedInboxAndRust(extensionWorker);
  const requests: ChatRequest[] = [];
  await context.route(`${BASE_URL}/**`, async (route) => {
    const request = JSON.parse(route.request().postData() ?? '{}') as ChatRequest;
    requests.push(request);
    const last = request.messages.at(-1);
    const userTurns = request.messages.filter((message) => message.role === 'user').length;
    if (last?.role === 'user' && userTurns === 1) {
      await streamChunks(
        route,
        [
          {
            role: 'assistant',
            tool_calls: [
              {
                index: 0,
                id: 'call_suggest',
                type: 'function',
                function: {
                  name: 'suggestActions',
                  arguments: JSON.stringify({
                    suggestions: [
                      { kind: 'ask', label: 'More on ownership?', text: 'Explain borrowing' },
                      { kind: 'option', label: 'A Reading folder', text: 'Make a Reading folder' },
                      {
                        kind: 'save',
                        url: 'https://rust.e2e.invalid/borrowing',
                        title: 'Borrowing',
                        folder: `f:${folderId}`,
                      },
                      { kind: 'open', ref: `b:${bookmarkId}` },
                      { kind: 'show', ref: `b:${bookmarkId}` },
                    ],
                  }),
                },
              },
            ],
          },
        ],
        'tool_calls',
      );
      return;
    }
    const asked = typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content);
    const reply =
      last?.role === 'tool'
        ? 'Here are some next steps.'
        : asked.includes('Reading')
          ? 'A Reading folder it is.'
          : 'Borrowing lends a value.';
    await streamChunks(route, [{ role: 'assistant', content: reply }], 'stop');
  });

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole('button', { name: 'Ask AI about your bookmarks or this page' }).click();
  const chat = page.getByTestId('ask-ai');
  const box = chat.getByRole('textbox', { name: /Ask about your bookmarks/ });
  await box.fill('Tell me about my Rust bookmarks');
  await box.press('Enter');
  await expect(chat.getByText('Here are some next steps.')).toBeVisible();

  const buttons = chat.getByRole('list', { name: 'Suggestions' });
  // Save, open, and show are labeled by the extension, never by the model.
  await expect(buttons.getByRole('button')).toHaveText([
    'More on ownership?',
    'A Reading folder',
    /^Save to .+\/Rust$/,
    'Open “Ownership guide”',
    'Show “Ownership guide” in the manager',
  ]);

  // Save: the click is the approval; the page lands in the folder, with Undo in the toast.
  await buttons.getByRole('button', { name: /^Save to / }).click();
  await expect(toastRegion(page)).toContainText(/Saved to .+\/Rust/);
  await expect
    .poll(() =>
      extensionWorker.evaluate(
        async (id) => (await chrome.bookmarks.getChildren(id)).map((node) => node.url),
        folderId,
      ),
    )
    .toEqual(['https://rust.e2e.invalid/borrowing']);
  await expect(buttons.getByRole('button', { name: /^Save to / })).toBeDisabled();

  // Open and show open tabs: the bookmark itself, and the manager at its folder.
  await context.route('https://rust.e2e.invalid/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>Ownership</title>' }),
  );
  const opened = context.waitForEvent('page');
  await buttons.getByRole('button', { name: 'Open “Ownership guide”' }).click();
  await (await opened).waitForURL('https://rust.e2e.invalid/ownership');
  const shown = context.waitForEvent('page');
  await buttons.getByRole('button', { name: /^Show / }).click();
  const manager = await shown;
  await manager.waitForURL(/bookmarks\.html\?id=/);
  expect(new URL(manager.url()).searchParams.get('id')).toBe(inboxId);

  // An option sends its text as the next message, once.
  await buttons.getByRole('button', { name: 'A Reading folder' }).click();
  await expect(chat.getByText('A Reading folder it is.')).toBeVisible();
  await expect(buttons.getByRole('button', { name: 'A Reading folder' })).toBeDisabled();

  // Ask: sends the question as the next message, once.
  await buttons.getByRole('button', { name: 'More on ownership?' }).click();
  await expect(chat.getByText('Borrowing lends a value.')).toBeVisible();
  await expect(
    chat.locator('[data-role="user"]').filter({ hasText: 'Explain borrowing' }),
  ).toBeVisible();
  await expect(buttons.getByRole('button', { name: 'More on ownership?' })).toBeDisabled();
});

test('[mocked provider contract] Ask AI is not offered the actions turned off in Options', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await replaceSettings(extensionWorker, {
    language: 'en',
    aiEnabled: true,
    aiAutoTriggerOnOpen: false,
  });
  await seedAskService(extensionWorker);
  const requests = await stubAgentProvider(context);

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByRole('tab', { name: 'AI', exact: true }).click();
  const panel = options.getByTestId('ask-ai-actions');
  // Deleting is not offered on its own: Ask AI deletes only through an approved plan.
  await expect(panel.getByRole('checkbox', { name: 'Delete bookmarks and folders' })).toHaveCount(
    0,
  );
  await panel.getByRole('checkbox', { name: 'List folders' }).click();
  await panel.getByRole('checkbox', { name: 'Apply approved changes' }).click();
  await expect(panel.getByRole('checkbox', { name: 'List folders' })).not.toBeChecked();

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole('button', { name: 'Ask AI about your bookmarks or this page' }).click();
  const chat = page.getByTestId('ask-ai');
  const box = chat.getByRole('textbox', { name: /Ask about your bookmarks/ });
  await box.fill('Which Rust pages did I save?');
  await box.press('Enter');
  await expect(chat.getByTestId('ask-ai-tool')).toHaveText('Searched your bookmarks for “rust”');

  const offered = JSON.stringify(requests[0]);
  expect(offered).toContain('"searchBookmarks"');
  expect(offered).not.toContain('"listFolders"');
  expect(offered).not.toContain('"applyChanges"');
  expect(offered).toContain('"proposeChanges"');
});
