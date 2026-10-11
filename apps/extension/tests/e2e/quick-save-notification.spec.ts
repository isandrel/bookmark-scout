import type { Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';
import { openPopup, seedFolder, setSettings } from './popup-helpers';
import {
  bookmarksWithUrl,
  clickToastButton,
  finishedRecord,
  pixelAt,
  pressShortcut,
  type QuickSaveRecord,
  type QuickSaveServer,
  readToast,
  startQuickSaveServer,
  toastButtonBox,
  toastButtons,
  toastPlacement,
  toastTexts,
} from './quick-save-helpers';
import { readStored, STORAGE_ITEMS, seedAIServices } from './storage';

/**
 * Where the quick save notification shows, and what it offers when things go wrong: pages whose
 * own styles would move, scale, flip, or recolor it; a tab that moved on while AI was choosing a
 * folder; a failed AI quick save; and an older tab's notification after a newer quick save.
 * `quick-save.spec.ts` covers saving, Undo, and Move to themselves.
 */

let server: QuickSaveServer;
test.beforeEach(async () => {
  server = await startQuickSaveServer();
});
test.afterEach(async () => {
  await server.close();
});

async function openArticle(page: Page, slug: string, query: Record<string, string> = {}) {
  const search = new URLSearchParams(query).toString();
  await page.goto(`${server.origin}/articles/${slug}${search ? `?${search}` : ''}`);
  await expect(page).toHaveTitle(slug.replace(/-/g, ' '));
}

async function useStubProvider(worker: Worker) {
  await setSettings(worker, { aiEnabled: true, aiMaxRecommendations: 3 });
  await seedAIServices(worker, [
    { provider: 'custom', model: 'e2e-model', credentials: { baseUrl: `${server.origin}/v1` } },
  ]);
}

/** Waits until the notification is drawn inside the viewport and on top at its center. */
async function expectOnScreen(page: Page) {
  await expect
    .poll(async () => {
      const placement = await toastPlacement(page);
      if (!placement) return 'not shown';
      const { box, hitsCenter, viewport } = placement;
      const inside =
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= viewport.width &&
        box.y + box.height <= viewport.height;
      return inside && hitsCenter ? 'on screen' : JSON.stringify(placement);
    })
    .toBe('on screen');
}

async function storedDelivery(worker: Worker) {
  return (await readStored<QuickSaveRecord>(worker, STORAGE_ITEMS.quickSave))?.delivery;
}

test.describe('the quick save notification in the page', () => {
  // The key press grants activeTab, which a dispatched command does not; website access stands in
  // for it so the notification can be drawn in the page.
  test.use({ grantWebHostAccess: true });

  test.beforeEach(async ({ extensionWorker }) => {
    await setSettings(extensionWorker, { language: 'en', theme: 'light' });
  });

  test('stays in view on a scrolled page whose body has a filter, transform, or will-change', async ({
    context,
    extensionWorker,
  }) => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1200, height: 800 });
    for (const [name, style] of [
      ['filter', 'filter: blur(0)'],
      ['transform', 'transform: translateZ(0)'],
      ['will-change', 'will-change: transform'],
    ]) {
      await openArticle(page, `Body-with-${name}`, {
        css: `body { ${style}; height: 4000px; margin: 0 }`,
      });
      await page.evaluate(() => window.scrollTo(0, 1500));
      await pressShortcut(extensionWorker, page, 'quick-save');
      expect(await finishedRecord(extensionWorker), name).toMatchObject({
        status: 'saved',
        delivery: 'page',
      });
      await expectOnScreen(page);
    }
  });

  test('keeps the app language direction and its size on a right-to-left, zoomed, inverted page', async ({
    context,
    extensionWorker,
  }) => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1200, height: 800 });
    await openArticle(page, 'Page-that-styles-everything', {
      dir: 'rtl',
      css: ':root { direction: rtl; zoom: 2; filter: invert(1) } div { all: unset !important }',
    });
    await pressShortcut(extensionWorker, page, 'quick-save');
    expect(await finishedRecord(extensionWorker)).toMatchObject({
      status: 'saved',
      delivery: 'page',
    });
    await expectOnScreen(page);

    const placement = await toastPlacement(page);
    if (!placement) throw new Error('No notification');
    const { box, viewport } = placement;
    // 360px wide, 16px from the top right, as on any page: the page's zoom does not scale it.
    expect(box.width).toBeLessThanOrEqual(362);
    expect(Math.abs(viewport.width - 16 - (box.x + box.width))).toBeLessThanOrEqual(4);
    expect(Math.abs(box.y - 16)).toBeLessThanOrEqual(4);
    // Left to right, like the app language: the close button ends the first line, Undo starts
    // the second.
    const close = await toastButtonBox(page, 'Dismiss');
    const undo = await toastButtonBox(page, 'Undo');
    expect(close.x).toBeGreaterThan(undo.x);
    // Light theme on a white surface: the page's invert filter does not reach it.
    const [red, green, blue] = await pixelAt(page, box.x + 6, box.y + box.height / 2);
    expect(Math.min(red, green, blue)).toBeGreaterThan(230);
  });

  test('[mocked provider contract] an AI quick save the tab left behind shows in the popup, naming the page', async ({
    context,
    extensionWorker,
    extensionId,
  }) => {
    const dev = await seedFolder(extensionWorker, 'Dev', []);
    await useStubProvider(extensionWorker);
    server.ai.recommendations = [
      { type: 'existing', folderPath: `${dev.barTitle}/Dev`, parentPath: '' },
    ];
    server.ai.delayMs = 2500;
    const page = await context.newPage();
    await openArticle(page, 'Postgres-indexing-guide');
    const savedUrl = page.url();

    await pressShortcut(extensionWorker, page, 'ai-quick-save');
    await expect.poll(() => toastTexts(page)).toContain('Choosing a folder with AI...');
    // The user moves on before AI answers.
    await openArticle(page, 'Another-page');

    await expect.poll(() => storedDelivery(extensionWorker), { timeout: 15_000 }).toBe('popup');
    const record = await finishedRecord(extensionWorker);
    expect(record).toMatchObject({
      status: 'saved',
      folderId: dev.folderId,
      page: { url: savedUrl },
    });
    expect(await bookmarksWithUrl(extensionWorker, savedUrl)).toHaveLength(1);
    // Nothing about the earlier page is drawn over this one.
    expect(await readToast(page)).toBeNull();

    const popup = await context.newPage();
    await openPopup(popup, extensionId);
    const panel = popup.getByTestId('quick-save-result');
    await expect(panel.getByTestId('quick-save-result-page')).toHaveText('Postgres indexing guide');
    await expect(panel).toContainText('Saved to Dev');
  });

  test('[mocked provider contract] a failed AI quick save offers Save without AI and Retry', async ({
    context,
    extensionWorker,
  }) => {
    const reading = await seedFolder(extensionWorker, 'Reading', []);
    const dev = await seedFolder(extensionWorker, 'Dev', []);
    await setSettings(extensionWorker, {
      quickSaveFolderStrategy: 'fixed',
      quickSaveFixedFolder: reading.folderId,
    });
    await useStubProvider(extensionWorker);
    server.ai.status = 400;
    const page = await context.newPage();

    // Save without AI: the Quick save setting picks the folder.
    await openArticle(page, 'Failing-AI-page');
    await pressShortcut(extensionWorker, page, 'ai-quick-save');
    expect(await finishedRecord(extensionWorker)).toMatchObject({
      status: 'failed',
      failure: 'aiFailed',
    });
    await expect.poll(() => toastTexts(page)).toContain('AI could not choose a folder');
    expect(await toastButtons(page)).toEqual(['Dismiss', 'Retry', 'Save without AI']);
    await clickToastButton(page, 'Save without AI');
    await expect.poll(() => toastTexts(page)).toContain('Saved to Reading');
    expect(await bookmarksWithUrl(extensionWorker, page.url())).toEqual([
      { id: expect.any(String), parentId: reading.folderId, title: 'Failing AI page' },
    ]);
    expect(await toastButtons(page)).toContain('Undo');

    // Retry: AI is asked again for the same page, and this time it answers.
    await openArticle(page, 'Second-failing-page');
    await pressShortcut(extensionWorker, page, 'ai-quick-save');
    expect((await finishedRecord(extensionWorker)).status).toBe('failed');
    await expect.poll(() => toastButtons(page)).toContain('Retry');
    server.ai.status = 200;
    server.ai.recommendations = [
      { type: 'existing', folderPath: `${dev.barTitle}/Dev`, parentPath: '' },
    ];
    const requests = server.ai.requests;
    await clickToastButton(page, 'Retry');
    await expect.poll(() => toastTexts(page)).toContain('Saved to Dev');
    expect(server.ai.requests).toBe(requests + 1);
    expect(await bookmarksWithUrl(extensionWorker, page.url())).toEqual([
      { id: expect.any(String), parentId: dev.folderId, title: 'Second failing page' },
    ]);
  });

  test('Undo in an older tab after a newer quick save says the newer one replaced it', async ({
    context,
    extensionWorker,
  }) => {
    const first = await context.newPage();
    await openArticle(first, 'First-tab-article');
    await pressShortcut(extensionWorker, first, 'quick-save');
    const firstRecord = await finishedRecord(extensionWorker);
    await expect.poll(() => toastButtons(first)).toContain('Undo');

    const second = await context.newPage();
    await openArticle(second, 'Second-tab-article');
    await pressShortcut(extensionWorker, second, 'quick-save');
    const secondRecord = await finishedRecord(extensionWorker);
    expect(secondRecord.id).not.toBe(firstRecord.id);

    await first.bringToFront();
    await clickToastButton(first, 'Undo');
    await expect
      .poll(() => toastTexts(first))
      .toEqual([
        'A newer quick save replaced this one',
        'Undo and Move to work on the latest quick save only. Change this bookmark in the bookmark manager.',
      ]);
    expect(await toastButtons(first)).toEqual(['Dismiss']);
    // Neither save was undone.
    expect(await bookmarksWithUrl(extensionWorker, first.url())).toHaveLength(1);
    expect(await bookmarksWithUrl(extensionWorker, second.url())).toHaveLength(1);
  });
});

test.describe('the quick save popup panel', () => {
  test('[mocked provider contract] offers Save without AI and Retry after a failed AI quick save', async ({
    context,
    extensionWorker,
    extensionId,
  }) => {
    await setSettings(extensionWorker, { language: 'en' });
    const reading = await seedFolder(extensionWorker, 'Reading', []);
    await setSettings(extensionWorker, {
      quickSaveFolderStrategy: 'fixed',
      quickSaveFixedFolder: reading.folderId,
    });
    await useStubProvider(extensionWorker);
    server.ai.status = 400;
    // Without activeTab or website access the extension cannot draw in this page.
    const page = await context.newPage();
    await openArticle(page, 'Unreachable-AI-page');
    await pressShortcut(extensionWorker, page, 'ai-quick-save');
    expect(await finishedRecord(extensionWorker)).toMatchObject({
      status: 'failed',
      delivery: 'popup',
    });

    const popup = await context.newPage();
    await openPopup(popup, extensionId);
    const panel = popup.getByTestId('quick-save-result');
    await expect(panel).toContainText('AI could not choose a folder');
    await expect(panel.getByTestId('quick-save-result-page')).toHaveText('Unreachable AI page');
    await expect(panel.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
    await panel.getByRole('button', { name: 'Save without AI', exact: true }).click();
    await expect(panel).toContainText('Saved to Reading');
    await expect
      .poll(() => bookmarksWithUrl(extensionWorker, page.url()))
      .toEqual([
        { id: expect.any(String), parentId: reading.folderId, title: 'Unreachable AI page' },
      ]);
  });
});
