import type { BrowserContext, Worker } from '@playwright/test';
import { streamChunks, stubPlanningProvider } from './ai-helpers';
import { expect, test, toastRegion } from './fixtures';
import { replaceSettings, seedAIServices } from './storage';

const BASE_URL = 'https://ask.e2e.invalid/v1';

function seedAskService(worker: Worker) {
  return seedAIServices(worker, [
    // A synthetic key, so a 401 reads as a rejected key (without one, as a key the service wants).
    {
      provider: 'custom',
      model: 'ask-model',
      credentials: { apiKey: 'synthetic-ask-key', baseUrl: BASE_URL },
    },
  ]);
}

type ChatRequest = { messages: { role: string; content: unknown }[]; stream?: boolean };

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
  await stubPlanningProvider(context, BASE_URL, { bookmarkId, folderId });

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
  await stubPlanningProvider(context, BASE_URL, { bookmarkId, folderId });

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
  // Like real models, it offers the buttons before writing the answer, on every turn.
  await context.route(`${BASE_URL}/**`, async (route) => {
    const request = JSON.parse(route.request().postData() ?? '{}') as ChatRequest;
    requests.push(request);
    if (request.messages.at(-1)?.role === 'user') {
      await streamChunks(
        route,
        [
          {
            role: 'assistant',
            tool_calls: [
              {
                index: 0,
                id: `call_suggest_${requests.length}`,
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
    const asked = JSON.stringify(request.messages.findLast((m) => m.role === 'user')?.content);
    const reply = asked.includes('Make a Reading folder')
      ? 'A Reading folder it is.'
      : asked.includes('Explain borrowing')
        ? 'Borrowing lends a value.'
        : 'Here are some next steps.';
    await streamChunks(route, [{ role: 'assistant', content: reply }], 'stop');
  });

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole('button', { name: 'Ask AI about your bookmarks or this page' }).click();
  const chat = page.getByTestId('ask-ai');
  const box = chat.getByRole('textbox', { name: /Ask about your bookmarks/ });
  await box.fill('Tell me about my Rust bookmarks and https://rust.e2e.invalid/borrowing');
  await box.press('Enter');
  await expect(chat.getByText('Here are some next steps.')).toBeVisible();

  const buttons = chat.getByRole('list', { name: 'Suggestions' });
  // Actions first, labeled by the extension, never by the model; then the questions and options.
  await expect(buttons.getByRole('button')).toHaveText([
    /^Save to .+\/Rustrust\.e2e\.invalid · “Borrowing”$/,
    'Open “Ownership guide”',
    'Show “Ownership guide” in the manager',
    'More on ownership?',
    'A Reading folder',
  ]);
  // The call is not a step of the answer.
  await expect(chat.getByTestId('ask-ai-tool')).toHaveCount(0);

  // Save: the click is the approval; the page lands in the folder, with Undo in the toast.
  await buttons.getByRole('button', { name: /^Save to / }).click();
  await expect(toastRegion(page)).toContainText(/Saved “Borrowing” to .+\/Rust/);
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

  // An option sends its text as the next message; the next answer brings fresh buttons, and
  // only the latest answer has any.
  await buttons.getByRole('button', { name: 'A Reading folder' }).click();
  await expect(box).toBeFocused();
  await expect(chat.getByText('A Reading folder it is.')).toBeVisible();
  await expect(buttons).toHaveCount(1);
  await expect(buttons.getByRole('button', { name: /^Save to / })).toBeEnabled();

  // Ask: sends the question as the next message.
  await buttons.getByRole('button', { name: 'More on ownership?' }).click();
  await expect(chat.getByText('Borrowing lends a value.')).toBeVisible();
  await expect(
    chat.locator('[data-role="user"]').filter({ hasText: 'Explain borrowing' }),
  ).toBeVisible();
  await expect(buttons).toHaveCount(1);
});

test('[mocked provider contract] suggestion buttons dock after the latest answer, above the message box', async ({
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
  let turn = 0;
  // Each turn: buttons first, as real models often do, then the answer text.
  await context.route(`${BASE_URL}/**`, async (route) => {
    const request = JSON.parse(route.request().postData() ?? '{}') as ChatRequest;
    if (request.messages.at(-1)?.role === 'user') {
      turn += 1;
      const question = turn === 1 ? 'First question?' : 'Second question?';
      await streamChunks(
        route,
        [
          {
            role: 'assistant',
            tool_calls: [
              {
                index: 0,
                id: `call_suggest_${turn}`,
                type: 'function',
                function: {
                  name: 'suggestActions',
                  arguments: JSON.stringify({
                    suggestions: [
                      { kind: 'ask', label: question, text: question },
                      { kind: 'option', label: `Option ${turn}`, text: `Option ${turn}` },
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
    const reply = turn === 1 ? 'First answer.' : 'Second answer.';
    await streamChunks(route, [{ role: 'assistant', content: reply }], 'stop');
  });

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole('button', { name: 'Ask AI about your bookmarks or this page' }).click();
  const chat = page.getByTestId('ask-ai');
  const box = chat.getByRole('textbox', { name: /Ask about your bookmarks/ });
  await box.fill('Hello');
  await box.press('Enter');
  const answer = chat.getByText('First answer.');
  await expect(answer).toBeVisible();

  // After the answer, outside the conversation, right above the message box.
  const dock = chat.getByTestId('ask-ai-suggestion-dock');
  const list = dock.getByRole('list', { name: 'Suggestions' });
  await expect(list.getByRole('button')).toHaveText(['First question?', 'Option 1']);
  await expect(chat.getByTestId('ask-ai-message').getByRole('list')).toHaveCount(0);
  const [answerBox, dockBox, inputBox] = await Promise.all(
    [answer, dock, box].map(async (locator) => {
      const rect = await locator.boundingBox();
      if (!rect) throw new Error('not laid out');
      return rect;
    }),
  );
  expect(answerBox.y + answerBox.height).toBeLessThanOrEqual(dockBox.y);
  expect(dockBox.y + dockBox.height).toBeLessThanOrEqual(inputBox.y);

  // Keyboard: the buttons come right before the message box.
  await box.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(list.getByRole('button', { name: 'Option 1' })).toBeFocused();

  // Typing hides them; an empty box brings them back.
  await box.fill('My own question');
  await expect(dock).toBeHidden();
  await box.fill('');
  await expect(dock).toBeVisible();

  // The next answer replaces them: only the latest answer has buttons.
  await list.getByRole('button', { name: 'First question?' }).click();
  await expect(chat.getByText('Second answer.')).toBeVisible();
  await expect(chat.getByRole('list', { name: 'Suggestions' })).toHaveCount(1);
  await expect(list.getByRole('button')).toHaveText(['Second question?', 'Option 2']);
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

test('[mocked provider contract] Ask AI keeps its chats: reopens the last one, lists the others, and deletes them', async ({
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
  await stubAgentProvider(context);
  const openAskAI = async () => {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.getByRole('button', { name: 'Ask AI about your bookmarks or this page' }).click();
    return page.getByTestId('ask-ai');
  };

  let chat = await openAskAI();
  const box = chat.getByRole('textbox', { name: /Ask about your bookmarks/ });
  await box.fill('Which Rust pages did I save?');
  await box.press('Enter');
  await expect(chat.getByTestId('ask-ai-tool')).toBeVisible();
  await expect(chat.getByTestId('ask-ai-message').last()).toHaveAttribute('data-role', 'assistant');

  // Closing the popup ends nothing: Ask AI opens on the same chat.
  chat = await openAskAI();
  await expect(chat.getByTestId('ask-ai-message').first()).toHaveText(
    'Which Rust pages did I save?',
  );

  // A new chat starts empty; Past chats reopens the kept one.
  await chat.getByRole('button', { name: 'New chat' }).click();
  await expect(chat.getByTestId('ask-ai-message')).toHaveCount(0);
  await chat.getByRole('button', { name: 'Past chats' }).click();
  await page.getByRole('menuitem', { name: /Which Rust pages did I save\?/ }).click();
  await expect(chat.getByTestId('ask-ai-message').first()).toHaveText(
    'Which Rust pages did I save?',
  );

  // Delete all chats empties the list and the chat.
  await chat.getByRole('button', { name: 'Past chats' }).click();
  await page.getByRole('menuitem', { name: 'Delete all chats' }).click();
  await expect(chat.getByTestId('ask-ai-message')).toHaveCount(0);
  await chat.getByRole('button', { name: 'Past chats' }).click();
  await expect(page.getByRole('menuitem', { name: 'No past chats yet' })).toBeVisible();
  await page.keyboard.press('Escape');

  // With Keep Chats off, nothing is kept and the button goes away.
  await replaceSettings(extensionWorker, {
    language: 'en',
    aiEnabled: true,
    aiAutoTriggerOnOpen: false,
    askAiKeepChats: false,
  });
  chat = await openAskAI();
  await box.fill('Which Rust pages did I save?');
  await box.press('Enter');
  await expect(chat.getByTestId('ask-ai-tool')).toBeVisible();
  await expect(chat.getByRole('button', { name: 'Past chats' })).toHaveCount(0);
  chat = await openAskAI();
  await expect(chat.getByTestId('ask-ai-message')).toHaveCount(0);
});
