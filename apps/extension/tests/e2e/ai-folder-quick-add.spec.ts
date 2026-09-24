import type { BrowserContext, Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';

type SeedItem = { title: string; url?: string; children?: SeedItem[] };

async function seedFolder(worker: Worker, title: string, items: SeedItem[]) {
  return worker.evaluate(
    async ({ folderTitle, entries }) => {
      const [root] = await chrome.bookmarks.getTree();
      const writableRoot = root.children?.find((node) => node.children !== undefined);
      if (!writableRoot) throw new Error('No writable bookmark root found');

      const folder = await chrome.bookmarks.create({
        parentId: writableRoot.id,
        title: folderTitle,
      });
      for (const item of entries) {
        const created = await chrome.bookmarks.create({
          parentId: folder.id,
          title: item.title,
          ...(item.url ? { url: item.url } : {}),
        });
        for (const child of item.children ?? []) {
          await chrome.bookmarks.create({
            parentId: created.id,
            title: child.title,
            ...(child.url ? { url: child.url } : {}),
          });
        }
      }
      return folder.id;
    },
    { folderTitle: title, entries: items },
  );
}

async function configureStubProvider(worker: Worker) {
  await worker.evaluate(async () => {
    await chrome.storage.sync.set({
      'bookmark-scout-settings': {
        aiEnabled: true,
        aiProvider: 'custom',
        aiModel: 'e2e-model',
        aiMaxRecommendations: 1,
        aiAutoTriggerOnOpen: false,
        recentFoldersEnabled: false,
      },
    });
    await chrome.storage.local.set({
      'bookmark-scout-ai': {
        custom: {
          baseUrl: 'https://e2e.invalid/v1',
          customModel: 'e2e-model',
        },
      },
    });
  });
}

async function stubRecommendation(
  context: BrowserContext,
  recommendation: {
    folderPath: string;
    parentPath: string;
    reason: string;
  },
) {
  let requestCount = 0;
  const text = JSON.stringify({
    recommendations: [
      {
        type: 'new',
        confidence: 0.95,
        ...recommendation,
      },
    ],
  });

  await context.route('https://e2e.invalid/v1/**', async (route) => {
    requestCount += 1;
    const url = route.request().url();
    if (url.endsWith('/responses')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          id: 'response-e2e',
          model: 'e2e-model',
          output: [
            {
              type: 'message',
              role: 'assistant',
              id: 'message-e2e',
              content: [{ type: 'output_text', text, annotations: [] }],
            },
          ],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        id: 'chat-e2e',
        model: 'e2e-model',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: text },
          },
        ],
      }),
    });
  });

  return () => requestCount;
}

async function openReview(
  page: Page,
  context: BrowserContext,
  worker: Worker,
  extensionId: string,
  folderPath: string,
) {
  await context.route('https://current.e2e.invalid/article', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<title>E2E AI Current Page</title><main>Fixture page</main>',
    }),
  );
  await page.goto('https://current.e2e.invalid/article');
  const targetTabId = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((tab) => tab.url === 'https://current.e2e.invalid/article')?.id;
  });
  if (targetTabId === undefined) throw new Error('Target tab not found');

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await worker.evaluate((id) => chrome.tabs.update(id, { active: true }), targetTabId);
  await popup.getByTitle('AI folder recommendation').click();
  await popup.getByRole('button', { name: folderPath }).click();
  const dialog = popup.getByRole('dialog', { name: 'Review new folder' });
  await expect(dialog).toContainText('E2E AI Current Page');
  await expect(dialog).toContainText('https://current.e2e.invalid/article');
  return { popup, dialog };
}

async function getFolderState(worker: Worker, parentId: string, path: string[]) {
  return worker.evaluate(
    async ({ rootId, segments }) => {
      let currentId = rootId;
      for (const segment of segments) {
        const children = await chrome.bookmarks.getChildren(currentId);
        const folder = children.find((child) => !child.url && child.title === segment);
        if (!folder) return null;
        currentId = folder.id;
      }
      const children = await chrome.bookmarks.getChildren(currentId);
      return {
        folderId: currentId,
        childFolders: children.filter((child) => !child.url).map((child) => child.title),
        urls: children.flatMap((child) => (child.url ? [child.url] : [])),
      };
    },
    { rootId: parentId, segments: path },
  );
}

test('reviews and creates an AI-recommended folder path with the current tab', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const parentId = await seedFolder(extensionWorker, 'E2E AI Parent', []);
  await configureStubProvider(extensionWorker);
  const requestCount = await stubRecommendation(context, {
    folderPath: 'E2E AI Parent/Research/Agents',
    parentPath: 'E2E AI Parent/Research',
    reason: 'Groups the fixture with agent research',
  });

  const { dialog } = await openReview(
    page,
    context,
    extensionWorker,
    extensionId,
    'E2E AI Parent/Research/Agents',
  );
  await dialog.getByRole('button', { name: 'Create Folder and Save' }).click();

  await expect
    .poll(() => getFolderState(extensionWorker, parentId, ['Research', 'Agents']))
    .toMatchObject({ urls: ['https://current.e2e.invalid/article'] });
  expect(requestCount()).toBe(1);
});

test('cancels an AI-recommended folder without changing bookmarks', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const parentId = await seedFolder(extensionWorker, 'E2E AI Cancel', []);
  await configureStubProvider(extensionWorker);
  const requestCount = await stubRecommendation(context, {
    folderPath: 'E2E AI Cancel/Cancelled',
    parentPath: 'E2E AI Cancel',
    reason: 'Cancellation fixture',
  });

  const { dialog } = await openReview(
    page,
    context,
    extensionWorker,
    extensionId,
    'E2E AI Cancel/Cancelled',
  );
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => getFolderState(extensionWorker, parentId, ['Cancelled'])).toBeNull();
  expect(requestCount()).toBe(1);
});

test('reports a path conflict without creating a folder or bookmark', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const parentId = await seedFolder(extensionWorker, 'E2E AI Conflict', [
    { title: 'Blocked', url: 'https://e2e.invalid/path-conflict' },
  ]);
  await configureStubProvider(extensionWorker);
  const requestCount = await stubRecommendation(context, {
    folderPath: 'E2E AI Conflict/Blocked/Child',
    parentPath: 'E2E AI Conflict/Blocked',
    reason: 'Conflict fixture',
  });

  const { popup, dialog } = await openReview(
    page,
    context,
    extensionWorker,
    extensionId,
    'E2E AI Conflict/Blocked/Child',
  );
  await dialog.getByRole('button', { name: 'Create Folder and Save' }).click();

  await expect(popup.getByText('Could not save recommendation', { exact: true })).toBeVisible();
  await expect(dialog).toBeVisible();
  const state = await getFolderState(extensionWorker, parentId, []);
  expect(state?.childFolders).toEqual([]);
  expect(state?.urls).toEqual(['https://e2e.invalid/path-conflict']);
  expect(requestCount()).toBe(1);
});
