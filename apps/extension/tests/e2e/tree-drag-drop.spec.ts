import type { Locator, Page, Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { bookmarkRow, childTitles, folderRow, seedFolder, setSettings } from './popup-helpers';

/**
 * Real pointer drags (mouse down, stepped moves, mouse up) in the popup and side panel tree,
 * verified against `chrome.bookmarks`. Folder rows have three drop zones (top quarter: before,
 * middle: into, bottom quarter: after); bookmark rows have two halves (before and after).
 */

type Surface = 'popup' | 'sidepanel';
type DropZone = 'before' | 'into' | 'after';

const ZONE_OFFSET: Record<DropZone, number> = { before: 0.12, into: 0.5, after: 0.88 };

async function openTree(page: Page, extensionId: string, surface: Surface) {
  await page.goto(`chrome-extension://${extensionId}/${surface}.html`);
  await expect(page.getByPlaceholder('Search bookmarks...')).toBeVisible();
}

/** The draggable, droppable part of a folder row. */
function folderHandle(page: Page, title: string) {
  return folderRow(page, title).locator('.cursor-grab');
}

/** The draggable, droppable part of a bookmark row. */
function bookmarkHandle(page: Page, title: string) {
  return bookmarkRow(page, title).locator('a');
}

async function centerOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Drag element is not visible');
  return box;
}

/** Press on the source, move through intermediate points, and release over the target zone. */
async function pointerDrag(page: Page, source: Locator, target: Locator, zone: DropZone) {
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  const from = await centerOf(source);
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 6, startY + 6, { steps: 3 });

  const to = await centerOf(target);
  await page.mouse.move(to.x + to.width / 2, to.y + to.height * ZONE_OFFSET[zone], { steps: 12 });
  await page.mouse.up();
}

async function subtree(worker: Worker, id: string) {
  return worker.evaluate(async (nodeId) => {
    type Node = chrome.bookmarks.BookmarkTreeNode;
    const strip = (node: Node): unknown => ({
      id: node.id,
      title: node.title,
      url: node.url,
      parentId: node.parentId,
      index: node.index,
      children: node.children?.map(strip),
    });
    const [node] = await chrome.bookmarks.getSubTree(nodeId);
    return strip(node);
  }, id);
}

async function indexOf(worker: Worker, id: string) {
  return worker.evaluate(async (nodeId) => (await chrome.bookmarks.get(nodeId))[0].index, id);
}

for (const surface of ['popup', 'sidepanel'] as const) {
  test.describe(`${surface} tree drag and drop`, () => {
    test('dragging a bookmark onto a folder moves it to the end of that folder', async ({
      extensionId,
      extensionWorker,
      page,
    }) => {
      const source = await seedFolder(extensionWorker, 'DnD Move Source', [
        { title: 'DnD Move Traveller', url: 'https://e2e.invalid/traveller' },
        { title: 'DnD Move Stayer', url: 'https://e2e.invalid/stayer' },
      ]);
      const destination = await seedFolder(extensionWorker, 'DnD Move Destination', [
        { title: 'DnD Move Resident', url: 'https://e2e.invalid/resident' },
      ]);

      await openTree(page, extensionId, surface);
      await page.getByPlaceholder('Search bookmarks...').fill('DnD Move');
      await pointerDrag(
        page,
        bookmarkHandle(page, 'DnD Move Traveller'),
        folderHandle(page, 'DnD Move Destination'),
        'into',
      );

      await expect
        .poll(() => childTitles(extensionWorker, destination.folderId))
        .toEqual(['DnD Move Resident', 'DnD Move Traveller']);
      expect(await childTitles(extensionWorker, source.folderId)).toEqual(['DnD Move Stayer']);
      await expect(
        toastRegion(page).getByText('"DnD Move Traveller" moved to "DnD Move Destination"', {
          exact: true,
        }),
      ).toHaveCount(1);
    });

    test('dragging a folder onto another folder nests it with its contents', async ({
      extensionId,
      extensionWorker,
      page,
    }) => {
      const seeded = await seedFolder(extensionWorker, 'DnD Nest Parent', [
        {
          title: 'DnD Nest Mover',
          children: [
            { title: 'DnD Nest Inner Link', url: 'https://e2e.invalid/inner' },
            { title: 'DnD Nest Inner Folder', children: [] },
          ],
        },
        {
          title: 'DnD Nest Home',
          children: [{ title: 'DnD Nest Home Link', url: 'https://e2e.invalid/home' }],
        },
      ]);
      const moverId = seeded.ids['DnD Nest Mover'];
      const homeId = seeded.ids['DnD Nest Home'];
      const moverBefore = await subtree(extensionWorker, moverId);

      await openTree(page, extensionId, surface);
      await page.getByPlaceholder('Search bookmarks...').fill('DnD Nest');
      await pointerDrag(
        page,
        folderHandle(page, 'DnD Nest Mover'),
        folderHandle(page, 'DnD Nest Home'),
        'into',
      );

      await expect
        .poll(() => childTitles(extensionWorker, homeId))
        .toEqual(['DnD Nest Home Link', 'DnD Nest Mover']);
      expect(await childTitles(extensionWorker, seeded.folderId)).toEqual(['DnD Nest Home']);
      // The folder keeps its own contents; only its parent and position change.
      expect(await subtree(extensionWorker, moverId)).toEqual({
        ...(moverBefore as object),
        parentId: homeId,
        index: 1,
      });
    });

    test('dropping before and after bookmarks sets their index in the folder', async ({
      extensionId,
      extensionWorker,
      page,
    }) => {
      await setSettings(extensionWorker, { sortOrder: 'folders' });
      const seeded = await seedFolder(extensionWorker, 'DnD Order Folder', [
        { title: 'Order A', url: 'https://e2e.invalid/order-a' },
        { title: 'Order B', url: 'https://e2e.invalid/order-b' },
        { title: 'Order C', url: 'https://e2e.invalid/order-c' },
        { title: 'Order D', url: 'https://e2e.invalid/order-d' },
      ]);
      const rows = page.locator('.bookmark-item');
      const drag = async (from: string, to: string, zone: DropZone, expected: string[]) => {
        await pointerDrag(page, bookmarkHandle(page, from), bookmarkHandle(page, to), zone);
        await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toEqual(expected);
        // The next drag reads indices from the rendered rows, so wait for them to catch up.
        await expect(rows).toHaveText(expected);
      };

      await openTree(page, extensionId, surface);
      await page.getByPlaceholder('Search bookmarks...').fill('Order ');
      await expect(rows).toHaveText(['Order A', 'Order B', 'Order C', 'Order D']);

      // Before a later sibling: move up.
      await drag('Order D', 'Order B', 'before', ['Order A', 'Order D', 'Order B', 'Order C']);
      expect(await indexOf(extensionWorker, seeded.ids['Order D'])).toBe(1);
      // After a later sibling: move down.
      await drag('Order A', 'Order B', 'after', ['Order D', 'Order B', 'Order A', 'Order C']);
      expect(await indexOf(extensionWorker, seeded.ids['Order A'])).toBe(2);
      // Before the first item: move to index 0.
      await drag('Order C', 'Order D', 'before', ['Order C', 'Order D', 'Order B', 'Order A']);
      expect(await indexOf(extensionWorker, seeded.ids['Order C'])).toBe(0);
      // After an earlier sibling: move up to just below it.
      await drag('Order A', 'Order C', 'after', ['Order C', 'Order A', 'Order D', 'Order B']);
      expect(await indexOf(extensionWorker, seeded.ids['Order A'])).toBe(1);
    });

    test('dropping on the top or bottom edge of a folder reorders sibling folders', async ({
      extensionId,
      extensionWorker,
      page,
    }) => {
      await setSettings(extensionWorker, { sortOrder: 'folders' });
      const seeded = await seedFolder(extensionWorker, 'DnD Shelf', [
        {
          title: 'Shelf One',
          children: [{ title: 'Shelf One Link', url: 'https://e2e.invalid/1' }],
        },
        {
          title: 'Shelf Two',
          children: [{ title: 'Shelf Two Link', url: 'https://e2e.invalid/2' }],
        },
        {
          title: 'Shelf Three',
          children: [{ title: 'Shelf Three Link', url: 'https://e2e.invalid/3' }],
        },
      ]);
      const shelfRows = page.locator('.folder-item').filter({ hasText: /^Shelf / });
      const drag = async (from: string, to: string, zone: DropZone, expected: string[]) => {
        await pointerDrag(page, folderHandle(page, from), folderHandle(page, to), zone);
        await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toEqual(expected);
        await expect(shelfRows).toHaveText(expected.map((title) => new RegExp(`^${title}`)));
      };

      await openTree(page, extensionId, surface);
      await page.getByPlaceholder('Search bookmarks...').fill('Shelf');
      await expect(shelfRows).toHaveCount(3);

      await drag('Shelf Three', 'Shelf One', 'before', ['Shelf Three', 'Shelf One', 'Shelf Two']);
      await drag('Shelf Three', 'Shelf Two', 'after', ['Shelf One', 'Shelf Two', 'Shelf Three']);
      await drag('Shelf One', 'Shelf Two', 'after', ['Shelf Two', 'Shelf One', 'Shelf Three']);
      // Edge drops reorder only: every folder keeps its own link.
      for (const title of ['One', 'Two', 'Three']) {
        expect(await childTitles(extensionWorker, seeded.ids[`Shelf ${title}`])).toEqual([
          `Shelf ${title} Link`,
        ]);
      }
    });

    test('dropping a folder into its own descendant leaves the whole tree unchanged', async ({
      extensionId,
      extensionWorker,
      page,
    }) => {
      const seeded = await seedFolder(extensionWorker, 'Cycle Root', [
        {
          title: 'Cycle Parent',
          children: [
            {
              title: 'Cycle Child',
              children: [
                {
                  title: 'Cycle Grandchild',
                  children: [{ title: 'Cycle Deep Link', url: 'https://e2e.invalid/deep' }],
                },
              ],
            },
          ],
        },
        { title: 'Cycle Sibling Link', url: 'https://e2e.invalid/sibling' },
      ]);
      const before = await subtree(extensionWorker, seeded.barId);
      const blocked = toastRegion(page).getByText(
        "A folder can't be moved into itself or one of its subfolders.",
        { exact: true },
      );

      const attempts: [Locator, DropZone][] = [
        // Into a nested subfolder.
        [folderHandle(page, 'Cycle Grandchild'), 'into'],
        // Beside a bookmark that lives inside a subfolder.
        [bookmarkHandle(page, 'Cycle Deep Link'), 'after'],
      ];
      for (const [target, zone] of attempts) {
        // A fresh page per attempt: an informational toast replaces the previous one.
        await openTree(page, extensionId, surface);
        await page.getByPlaceholder('Search bookmarks...').fill('Cycle');
        await expect(bookmarkRow(page, 'Cycle Deep Link')).toBeVisible();

        await pointerDrag(page, folderHandle(page, 'Cycle Parent'), target, zone);
        await expect(blocked).toHaveCount(1);
        expect(await subtree(extensionWorker, seeded.barId)).toEqual(before);
      }
    });
  });
}
