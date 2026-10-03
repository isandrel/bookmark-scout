import type { BrowserContext, Page, Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { setSettings } from './popup-helpers';

// The harness opens the popup as a tab, which gets no activeTab (the toolbar button grants it),
// so these tests grant the optional tabs permission to read the current page.
test.use({ grantPermissions: ['tabs'] });

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

async function configureStubProvider(worker: Worker, settings: Record<string, unknown> = {}) {
  await worker.evaluate(async (overrides) => {
    await chrome.storage.sync.set({
      'bookmark-scout-settings': {
        aiEnabled: true,
        aiProvider: 'custom',
        aiModel: 'e2e-model',
        aiMaxRecommendations: 1,
        aiAutoTriggerOnOpen: false,
        recentFoldersEnabled: false,
        ...overrides,
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
  }, settings);
}

type StubRecommendation = {
  type?: 'new' | 'existing';
  folderPath: string;
  parentPath: string;
  reason: string;
};

function stubRecommendation(context: BrowserContext, recommendation: StubRecommendation) {
  return stubRecommendations(context, [recommendation]);
}

async function stubRecommendations(
  context: BrowserContext,
  recommendations: StubRecommendation[],
  { status = 200 }: { status?: number } = {},
) {
  let requestCount = 0;
  const text = JSON.stringify({
    recommendations: recommendations.map((recommendation) => ({
      type: 'new',
      confidence: 0.95,
      ...recommendation,
    })),
  });

  await context.route('https://e2e.invalid/v1/**', async (route) => {
    requestCount += 1;
    if (status !== 200) {
      await route.fulfill({
        status,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ error: { message: 'Synthetic provider failure' } }),
      });
      return;
    }
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

/** Opens the popup over the fixture page and asks for folder suggestions. */
async function openSuggestions(
  page: Page,
  context: BrowserContext,
  worker: Worker,
  extensionId: string,
  /** The popup's size, set in settings and as the viewport, as in the real toolbar popup. */
  size?: { width: number; height: number },
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
  if (size) {
    await setSettings(worker, { popupWidth: size.width, popupHeight: size.height });
    await popup.setViewportSize(size);
  }
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await worker.evaluate((id) => chrome.tabs.update(id, { active: true }), targetTabId);
  await popup.getByTitle('AI folder recommendation').click();
  return popup;
}

async function openReview(
  page: Page,
  context: BrowserContext,
  worker: Worker,
  extensionId: string,
  folderPath: string,
) {
  const popup = await openSuggestions(page, context, worker, extensionId);
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

test('names suggestions without the bookmarks bar and quotes a short page title whole', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await configureStubProvider(extensionWorker);
  const barTitle = await readBarTitle(extensionWorker);
  await stubRecommendation(context, {
    folderPath: `${barTitle}/E2E Bar Suggestion`,
    parentPath: barTitle,
    reason: 'Bar prefix fixture',
  });

  const popup = await openSuggestions(page, context, extensionWorker, extensionId);
  const suggestion = popup.getByRole('button', { name: /E2E Bar Suggestion/ });
  await expect(suggestion).toContainText('E2E Bar Suggestion');
  await expect(suggestion).not.toContainText(barTitle);
  await expect(popup.getByText(/^AI Suggestions for:/)).toHaveText(
    'AI Suggestions for: E2E AI Current Page',
  );
});

/** Each browser and language names the bar differently ("Bookmarks bar", "Favorites bar"). */
function readBarTitle(worker: Worker) {
  return worker.evaluate(async () => {
    const [root] = await chrome.bookmarks.getTree();
    const permanent = root.children ?? [];
    return (permanent.find((folder) => folder.folderType === 'bookmarks-bar') ?? permanent[0])
      .title;
  });
}

for (const { width, height, count } of [
  { width: 400, height: 500, count: 10 },
  { width: 300, height: 300, count: 5 },
]) {
  test(`${count} suggestions in a ${width}x${height} popup scroll inside their panel`, async ({
    context,
    extensionId,
    extensionWorker,
    page,
  }) => {
    await configureStubProvider(extensionWorker, { aiMaxRecommendations: count });
    const barTitle = await readBarTitle(extensionWorker);
    await stubRecommendations(
      context,
      Array.from({ length: count }, (_, index) => ({
        type: 'existing' as const,
        // Two digits, so no name is the start of another.
        folderPath: `${barTitle}/E2E Suggestion ${String(index + 1).padStart(2, '0')}`,
        parentPath: '',
        reason: `Layout fixture ${index + 1}`,
      })),
    );

    const popup = await openSuggestions(page, context, extensionWorker, extensionId, {
      width,
      height,
    });
    const last = popup.getByRole('button', {
      name: `E2E Suggestion ${String(count).padStart(2, '0')}`,
    });
    await expect(last).toBeAttached();
    await popup.mouse.move(0, 0);

    // The tree and key hints keep their room; the suggestions scroll on their own.
    const hints = popup.getByTestId('popup-hint-bar');
    await expect(hints).toBeInViewport({ ratio: 1 });
    await expect(popup.locator('.folder-item').first()).toBeInViewport({ ratio: 1 });
    await expect(last).not.toBeInViewport();
    await popup.getByRole('button', { name: 'E2E Suggestion 01' }).hover();
    await popup.mouse.wheel(0, 2_000);
    await expect(last).toBeInViewport({ ratio: 1 });
    await expect(hints).toBeInViewport({ ratio: 1 });

    // The search box placeholder is shown whole, never cut off mid-word.
    const search = popup.getByRole('combobox', { name: 'Search bookmarks...' });
    await expect
      .poll(() =>
        search.evaluate((input: HTMLInputElement) => {
          const style = getComputedStyle(input);
          const context2d = document.createElement('canvas').getContext('2d');
          if (!context2d) return Number.NaN;
          context2d.font = style.font;
          const free =
            input.getBoundingClientRect().width -
            Number.parseFloat(style.borderLeftWidth) -
            Number.parseFloat(style.borderRightWidth) -
            Number.parseFloat(style.paddingLeft) -
            Number.parseFloat(style.paddingRight);
          return free - context2d.measureText(input.placeholder).width;
        }),
      )
      .toBeGreaterThanOrEqual(0);
  });
}

test('reviews a path through a folder whose title contains "/" as separate folders', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const parentId = await seedFolder(extensionWorker, 'E2E Slash Parent', [
    { title: 'CI/CD', children: [] },
  ]);
  await configureStubProvider(extensionWorker);
  const barTitle = await readBarTitle(extensionWorker);
  await stubRecommendation(context, {
    folderPath: `${barTitle}/E2E Slash Parent/CI/CD/Pipelines`,
    parentPath: '',
    reason: 'Slash title fixture',
  });

  const { popup, dialog } = await openReview(
    page,
    context,
    extensionWorker,
    extensionId,
    'E2E Slash Parent/CI/CD/Pipelines',
  );
  const segments = dialog
    .getByTestId('recommended-folder-path')
    .locator('[data-slot=path-segment]');
  await expect(segments).toHaveText([barTitle, 'E2E Slash Parent', 'CI/CD', /^Pipelines\s*new$/]);
  await expect(segments.last()).toHaveAttribute('data-new', '');
  await expect(segments.nth(2)).not.toHaveAttribute('data-new');

  await dialog.getByRole('button', { name: 'Create Folder and Save' }).click();
  await expect
    .poll(() => getFolderState(extensionWorker, parentId, ['CI/CD', 'Pipelines']))
    .toMatchObject({ urls: ['https://current.e2e.invalid/article'] });
  // No "CI" folder with a "CD" folder inside was made from the title.
  expect((await getFolderState(extensionWorker, parentId, []))?.childFolders).toEqual(['CI/CD']);
  const toast = toastRegion(popup);
  await expect(toast.getByText('✓ Bookmark saved', { exact: true })).toBeVisible();
  await expect(
    toast.getByText(
      `Created or reused "${barTitle} / E2E Slash Parent / CI/CD / Pipelines" and saved the current page.`,
      { exact: true },
    ),
  ).toBeVisible();
});

test('an earlier toast does not cover the review dialog buttons', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedFolder(extensionWorker, 'E2E Toast Target', []);
  await configureStubProvider(extensionWorker, {
    aiMaxRecommendations: 2,
    toastDurationMs: 10_000,
  });
  const barTitle = await readBarTitle(extensionWorker);
  await stubRecommendations(context, [
    {
      type: 'existing',
      folderPath: `${barTitle}/E2E Toast Target`,
      parentPath: '',
      reason: 'Existing fixture',
    },
    {
      folderPath: `${barTitle}/E2E Toast Target/Fresh`,
      parentPath: '',
      // A long reason makes the dialog as tall as the popup, as with long page titles.
      reason: 'A long reason for the new folder. '.repeat(8),
    },
  ]);

  const popup = await openSuggestions(page, context, extensionWorker, extensionId, {
    width: 400,
    height: 500,
  });
  // The name ends with the confidence, which tells the two paths apart.
  const suggestion = (path: string) =>
    popup.getByRole('button', { name: new RegExp(`^${path}\\s*\\d`) });
  await suggestion('E2E Toast Target').click();
  await expect(toastRegion(popup).getByText('✓ Bookmark Added', { exact: true })).toBeVisible();

  await popup.getByTitle('AI folder recommendation').click();
  await suggestion('E2E Toast Target/Fresh').click();
  const dialog = popup.getByRole('dialog', { name: 'Review new folder' });
  await expect(dialog).toBeVisible();
  // A modal dialog makes the rest of the page ignore the pointer, so hit tests see through the
  // toast; compare the boxes instead.
  const overlaps = async () => {
    const buttons = await Promise.all(
      ['Create Folder and Save', 'Cancel'].map((name) =>
        dialog.getByRole('button', { name, exact: true }).boundingBox(),
      ),
    );
    const toasts = await Promise.all(
      (await toastRegion(popup).getByRole('status', { includeHidden: true }).all()).map((toast) =>
        toast.boundingBox(),
      ),
    );
    return buttons.flatMap((button) =>
      toasts.filter(
        (toast) =>
          button &&
          toast &&
          toast.x < button.x + button.width &&
          button.x < toast.x + toast.width &&
          toast.y < button.y + button.height &&
          button.y < toast.y + toast.height,
      ),
    ).length;
  };
  // Well before the toast would have timed out on its own.
  await expect.poll(overlaps, { timeout: 3_000 }).toBe(0);
});

test('[mocked provider contract] a rejected request explains the error in a failure toast', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await configureStubProvider(extensionWorker);
  await stubRecommendations(context, [], { status: 401 });

  const popup = await openSuggestions(page, context, extensionWorker, extensionId);
  const toast = toastRegion(popup);
  await expect(toast.getByText('× AI Recommendation Failed', { exact: true })).toBeVisible();
  await expect(
    toast.getByText(
      'The provider rejected the API key. Check that it is correct and still active.',
      { exact: true },
    ),
  ).toBeVisible();
});
