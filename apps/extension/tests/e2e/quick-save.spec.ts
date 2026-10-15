import type { Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';
import { openPopup, seedFolder, setSettings } from './popup-helpers';
import {
  bookmarksWithUrl,
  clickToastButton,
  finishedRecord,
  pressShortcut,
  type QuickSaveServer,
  readToast,
  startQuickSaveServer,
  toastButtons,
  toastTexts,
} from './quick-save-helpers';
import { readSettings, readStored, STORAGE_ITEMS, seedAIServices, writeStored } from './storage';

/**
 * Quick save shortcuts, fired and read through `quick-save-helpers.ts`: the command goes to the
 * background's real listener, and the notification is read and clicked through the browser's
 * accessibility tree.
 */

async function folderTitle(worker: Worker, id: string | undefined) {
  return worker.evaluate(
    async (folderId) => (await chrome.bookmarks.get(folderId))[0].title,
    id ?? '',
  );
}

let server: QuickSaveServer;
test.beforeEach(async () => {
  server = await startQuickSaveServer();
});
test.afterEach(async () => {
  await server.close();
});

async function openArticle(page: Page, slug: string) {
  await page.goto(`${server.origin}/articles/${slug}`);
  await expect(page).toHaveTitle(slug.replace(/-/g, ' '));
}

test.describe('quick save in the page', () => {
  // The key press grants activeTab, which a dispatched command does not; website access stands in
  // for it so the notification can be drawn in the page.
  test.use({ grantWebHostAccess: true });

  test.beforeEach(async ({ extensionWorker }) => {
    await setSettings(extensionWorker, { language: 'en', theme: 'light' });
  });

  test('saves to the best matching folder, shows it, and Undo removes the bookmark', async ({
    context,
    extensionWorker,
  }) => {
    const react = await seedFolder(extensionWorker, 'React', [
      { title: 'React hooks reference', url: 'https://react.e2e.invalid/reference/hooks' },
      { title: 'Thinking in React', url: 'https://react.e2e.invalid/learn' },
    ]);
    await seedFolder(extensionWorker, 'Cooking', [
      { title: 'Pasta recipe', url: 'https://food.e2e.invalid/pasta' },
    ]);
    const page = await context.newPage();
    await openArticle(page, 'React-hooks-in-depth');

    await pressShortcut(extensionWorker, page, 'quick-save');
    const record = await finishedRecord(extensionWorker);
    expect(record).toMatchObject({ status: 'saved', delivery: 'page', folderId: react.folderId });
    expect(await bookmarksWithUrl(extensionWorker, page.url())).toEqual([
      { id: record.bookmarkId, parentId: react.folderId, title: 'React hooks in depth' },
    ]);

    await expect
      .poll(() => toastTexts(page))
      .toEqual(expect.arrayContaining(['Saved to React', `${react.barTitle} / React`]));
    expect(await toastButtons(page)).toEqual(expect.arrayContaining(['Undo', 'Dismiss']));

    await clickToastButton(page, 'Undo');
    await expect.poll(() => bookmarksWithUrl(extensionWorker, page.url())).toEqual([]);
    await expect.poll(() => toastTexts(page)).toContain('Bookmark removed');

    // Escape closes it without taking focus from the page.
    await page.keyboard.press('Escape');
    await expect.poll(() => readToast(page)).toBeNull();
  });

  test('moves the bookmark to another folder chosen in the notification', async ({
    context,
    extensionWorker,
  }) => {
    const react = await seedFolder(extensionWorker, 'React', [
      { title: 'React hooks reference', url: 'https://react.e2e.invalid/reference/hooks' },
    ]);
    const frontend = await seedFolder(extensionWorker, 'Frontend', [
      { title: 'Hooks and components', url: 'https://frontend.e2e.invalid/hooks' },
    ]);
    const page = await context.newPage();
    await openArticle(page, 'React-hooks-patterns');

    await pressShortcut(extensionWorker, page, 'quick-save');
    const record = await finishedRecord(extensionWorker);
    expect(record.folderId).toBe(react.folderId);
    await expect.poll(() => toastButtons(page)).toContain('Frontend');

    await clickToastButton(page, 'Frontend');
    await expect
      .poll(async () => (await bookmarksWithUrl(extensionWorker, page.url()))[0]?.parentId)
      .toBe(frontend.folderId);
    await expect.poll(() => toastTexts(page)).toContain('Saved to Frontend');
    // The folder it left is offered back, and the new one is now the most recent folder.
    expect(await toastButtons(page)).toContain('React');
    const recent = (
      await readStored<{ id: string }[]>(extensionWorker, STORAGE_ITEMS.recentFolders)
    )?.[0]?.id;
    expect(recent).toBe(frontend.folderId);
  });

  test('does not save a page twice and offers to move the saved one', async ({
    context,
    extensionWorker,
  }) => {
    const page = await context.newPage();
    await openArticle(page, 'Rust-ownership-explained');
    const reading = await seedFolder(extensionWorker, 'Reading', [
      { title: 'Rust ownership explained', url: page.url() },
    ]);
    const rust = await seedFolder(extensionWorker, 'Rust', [
      { title: 'The Rust book', url: 'https://rust.e2e.invalid/book' },
    ]);

    await pressShortcut(extensionWorker, page, 'quick-save');
    const record = await finishedRecord(extensionWorker);
    expect(record).toMatchObject({ status: 'duplicate', folderId: reading.folderId });
    expect(await bookmarksWithUrl(extensionWorker, page.url())).toHaveLength(1);
    await expect.poll(() => toastTexts(page)).toContain('Already in Reading');
    expect(await toastButtons(page)).not.toContain('Undo');

    await clickToastButton(page, 'Rust');
    await expect
      .poll(async () => (await bookmarksWithUrl(extensionWorker, page.url()))[0]?.parentId)
      .toBe(rust.folderId);
    expect(await bookmarksWithUrl(extensionWorker, page.url())).toHaveLength(1);
    // Undo after the move puts it back where it was. The notification redraws after the move.
    await expect.poll(() => toastButtons(page)).toContain('Undo');
    await clickToastButton(page, 'Undo');
    await expect
      .poll(async () => (await bookmarksWithUrl(extensionWorker, page.url()))[0]?.parentId)
      .toBe(reading.folderId);
  });

  test('the last used and chosen folder strategies decide where quick save goes', async ({
    context,
    extensionWorker,
  }) => {
    const inbox = await seedFolder(extensionWorker, 'Inbox', []);
    const later = await seedFolder(extensionWorker, 'Read later', []);
    await writeStored(extensionWorker, STORAGE_ITEMS.recentFolders, [
      { id: inbox.folderId, title: 'Inbox', lastUsed: Date.now() },
    ]);
    const page = await context.newPage();

    await setSettings(extensionWorker, { quickSaveFolderStrategy: 'last_used' });
    await openArticle(page, 'Weekly-news-digest');
    await pressShortcut(extensionWorker, page, 'quick-save');
    expect((await finishedRecord(extensionWorker)).folderId).toBe(inbox.folderId);

    await setSettings(extensionWorker, {
      quickSaveFolderStrategy: 'fixed',
      quickSaveFixedFolder: later.folderId,
    });
    await openArticle(page, 'Another-long-read');
    await pressShortcut(extensionWorker, page, 'quick-save');
    expect((await finishedRecord(extensionWorker)).folderId).toBe(later.folderId);

    // The chosen folder is gone: the last used folder takes the page, and the notification says so.
    await extensionWorker.evaluate((id) => chrome.bookmarks.removeTree(id), later.folderId);
    await openArticle(page, 'A-third-article');
    await pressShortcut(extensionWorker, page, 'quick-save');
    const fallback = await finishedRecord(extensionWorker);
    expect(fallback.folderId).toBe(inbox.folderId);
    await expect
      .poll(() => toastTexts(page))
      .toContain(
        'Your quick save folder no longer exists, so the page went to your last used folder or the bookmarks bar.',
      );
  });

  test('[mocked provider contract] AI quick save saves to the first suggestion and moves to another', async ({
    context,
    extensionWorker,
  }) => {
    const dev = await seedFolder(extensionWorker, 'Dev', []);
    await setSettings(extensionWorker, {
      aiEnabled: true,
      aiMaxRecommendations: 3,
      // Recording on, to see the request go through the logging fetch.
      aiActivityRecording: true,
    });
    await seedAIServices(extensionWorker, [
      { provider: 'custom', model: 'e2e-model', credentials: { baseUrl: `${server.origin}/v1` } },
    ]);
    server.ai.recommendations = [
      { type: 'new', folderPath: `${dev.barTitle}/Dev/Databases`, parentPath: '' },
      { type: 'existing', folderPath: `${dev.barTitle}/Dev`, parentPath: '' },
    ];
    server.ai.delayMs = 1500;
    const page = await context.newPage();
    await openArticle(page, 'Postgres-indexing-guide');

    await pressShortcut(extensionWorker, page, 'ai-quick-save');
    // "Saving…" shows at once while the AI call runs.
    await expect.poll(() => toastTexts(page)).toContain('Choosing a folder with AI...');
    const record = await finishedRecord(extensionWorker);
    expect(server.ai.requests).toBe(1);
    expect(record.status).toBe('saved');
    expect(record.createdFolderIds).toHaveLength(1);
    expect(await folderTitle(extensionWorker, record.folderId)).toBe('Databases');
    await expect.poll(() => toastTexts(page)).toContain('Saved to Databases');

    // The other suggestion moves it; the empty folder the save created goes away.
    await clickToastButton(page, 'Dev');
    await expect
      .poll(async () => (await bookmarksWithUrl(extensionWorker, page.url()))[0]?.parentId)
      .toBe(dev.folderId);
    await expect
      .poll(() =>
        extensionWorker.evaluate(
          async (id) => (await chrome.bookmarks.get(id).catch(() => [])).length,
          record.folderId ?? '',
        ),
      )
      .toBe(0);
    // The request went through the background's logging fetch, which recorded it.
    expect(server.ai.requests).toBe(1);
    await expect
      .poll(async () => {
        const entries =
          (await readStored<{ source: string; status?: number }[]>(
            extensionWorker,
            STORAGE_ITEMS.aiActivity,
          )) ?? [];
        return entries.map(({ source, status }) => `${source} ${status}`);
      })
      .toEqual(['folderRecommendation 200']);
  });

  test('AI quick save with AI off offers the AI settings and saves nothing', async ({
    context,
    extensionWorker,
    extensionId,
  }) => {
    const page = await context.newPage();
    await openArticle(page, 'Some-article');
    await pressShortcut(extensionWorker, page, 'ai-quick-save');
    const record = await finishedRecord(extensionWorker);
    expect(record.status).toBe('failed');
    expect(await bookmarksWithUrl(extensionWorker, page.url())).toEqual([]);
    await expect.poll(() => toastTexts(page)).toContain('AI quick save is not set up');

    const optionsPage = context.waitForEvent('page');
    await clickToastButton(page, 'Open AI settings');
    const options = await optionsPage;
    await expect(options).toHaveURL(`chrome-extension://${extensionId}/options.html?category=ai`);
    await expect(options.getByRole('tab', { name: 'AI', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

test.describe('quick save where the page cannot show it', () => {
  test('shows the badge and offers Undo in the popup', async ({
    context,
    extensionWorker,
    extensionId,
  }) => {
    await setSettings(extensionWorker, { language: 'en' });
    const reading = await seedFolder(extensionWorker, 'Reading', []);
    await writeStored(extensionWorker, STORAGE_ITEMS.recentFolders, [
      { id: reading.folderId, title: 'Reading', lastUsed: Date.now() },
    ]);
    // Without activeTab or website access the extension cannot draw in this page.
    const page = await context.newPage();
    await openArticle(page, 'Unreachable-page');
    await pressShortcut(extensionWorker, page, 'quick-save');
    const record = await finishedRecord(extensionWorker);
    expect(record).toMatchObject({
      status: 'saved',
      delivery: 'popup',
      folderId: reading.folderId,
    });
    expect(await readToast(page)).toBeNull();
    const badge = await extensionWorker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return chrome.action.getBadgeText({ tabId: tab.id });
    });
    expect(badge).toBe('✓');

    const popup = await context.newPage();
    await openPopup(popup, extensionId);
    const panel = popup.getByTestId('quick-save-result');
    await expect(panel).toContainText('Last quick save');
    await expect(panel).toContainText('Saved to Reading');
    await panel.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(() => bookmarksWithUrl(extensionWorker, page.url())).toEqual([]);
    await expect(panel).toContainText('Bookmark removed');

    // Undone, it has nothing left to offer: a popup opened later leaves it out.
    const later = await context.newPage();
    await openPopup(later, extensionId);
    await expect(later.getByTestId('popup-hint-bar')).toBeVisible();
    await expect(later.getByTestId('quick-save-result')).toHaveCount(0);

    await panel.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(panel).toHaveCount(0);
  });
});

test('Options shows the shortcut keys and saves the chosen quick save folder', async ({
  page,
  extensionWorker,
  extensionId,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  const later = await seedFolder(extensionWorker, 'Read later', []);
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'Saving & Search', exact: true }).click();

  const shortcuts = page.getByTestId('quick-save-shortcuts');
  await expect(shortcuts.locator('[data-command="quick-save"]')).toContainText(
    'Quick save the current page',
  );
  // The suggested keys, as the browser reports them on this platform.
  await expect(shortcuts.locator('[data-command="quick-save"] kbd').last()).toHaveText('S');
  await expect(shortcuts.locator('[data-command="ai-quick-save"] kbd').last()).toHaveText('D');
  await expect(shortcuts.getByRole('button', { name: 'Change shortcuts' })).toBeVisible();

  const folderSetting = page.locator('[data-setting="quickSaveFixedFolder"]');
  await folderSetting.getByRole('combobox').click();
  await page.getByRole('combobox', { name: 'Search...' }).fill('read later');
  await page.getByRole('option', { name: `${later.barTitle} / Read later` }).click();
  await expect
    .poll(async () => (await readSettings(extensionWorker)).quickSaveFixedFolder)
    .toBe(later.folderId);
});
