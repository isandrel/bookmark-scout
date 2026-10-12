/**
 * The bookmark manager in narrow windows and deep folders: below the drawer width the sidebars
 * open over the table, the header buttons and toolbar controls never overlap, deep tree folders
 * stop indenting and show their depth, and a deep path collapses its middle into a menu.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { breadcrumbCurrent, managerUrl, treeFolder } from './manager-helpers';
import { seedFolder, setSettings } from './popup-helpers';

type Box = { x: number; y: number; width: number; height: number };

/** The boxes of the visible elements `locator` matches. */
async function visibleBoxes(locator: Locator): Promise<Box[]> {
  const boxes = await locator.evaluateAll((elements) =>
    elements
      .filter((element) => (element as HTMLElement).checkVisibility())
      .map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }),
  );
  return boxes.filter((box) => box.width > 0 && box.height > 0);
}

/** Pairs of boxes that overlap by more than a pixel. */
function overlaps(boxes: Box[]): [Box, Box][] {
  const pairs: [Box, Box][] = [];
  boxes.forEach((left, index) => {
    for (const right of boxes.slice(index + 1)) {
      const x = Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x);
      const y = Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
      if (x > 1 && y > 1) pairs.push([left, right]);
    }
  });
  return pairs;
}

async function expectNoOverlapWithin(page: Page, locator: Locator) {
  const width = page.viewportSize()?.width ?? 0;
  await expect
    .poll(async () => {
      const boxes = await visibleBoxes(locator);
      const outside = boxes.filter((box) => box.x < -1 || box.x + box.width > width + 1);
      return { count: boxes.length > 0, overlaps: overlaps(boxes).length, outside: outside.length };
    })
    .toEqual({ count: true, overlaps: 0, outside: 0 });
}

test.beforeEach(async ({ extensionWorker }) => {
  await setSettings(extensionWorker, { sortOrder: 'alphabetical' });
});

for (const width of [600, 420]) {
  test(`at ${width}px the sidebars open over the table and nothing overlaps`, async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const seeded = await seedFolder(extensionWorker, 'E2E Narrow', [
      { title: 'Narrow Sub', children: [] },
      { title: 'Narrow Link', url: 'https://e2e.invalid/narrow' },
    ]);
    await page.goto(managerUrl(extensionId, seeded.folderId));
    await expect(breadcrumbCurrent(page)).toHaveText('E2E Narrow');
    await page.mouse.move(0, 0);

    // The folder sidebar starts closed and takes no room from the table.
    const sidebar = page.getByTestId('folder-sidebar');
    await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    await expect.poll(async () => (await page.locator('main').boundingBox())?.x).toBe(0);

    // Header buttons and toolbar controls each keep their own room.
    await expectNoOverlapWithin(page, page.locator('header button'));
    const toolbar = page.getByTestId('bookmark-table-toolbar');
    await expectNoOverlapWithin(
      page,
      toolbar.locator('input, button:not([role="checkbox"]), [role="checkbox"]'),
    );

    // The folder drawer opens over the table, and picking a folder closes it.
    const mainWidth = (await page.locator('main').boundingBox())?.width;
    const toggle = page.getByRole('button', { name: 'Show folders' });
    await toggle.click();
    await expect(sidebar).not.toHaveAttribute('aria-hidden', 'true');
    await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBeGreaterThan(200);
    expect((await page.locator('main').boundingBox())?.width).toBe(mainWidth);
    await treeFolder(page, 'Narrow Sub').click();
    await expect(page).toHaveURL(new RegExp(`id=${seeded.ids['Narrow Sub']}$`));
    await expect(sidebar).toHaveAttribute('aria-hidden', 'true');

    // Escape closes it too, giving focus back to its button.
    await toggle.click();
    await expect(sidebar).not.toHaveAttribute('aria-hidden', 'true');
    await page.keyboard.press('Escape');
    await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    await expect(toggle).toBeFocused();
  });
}

test('deep folders stop indenting in the tree, and a deep path collapses its middle', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  // Twelve levels below the seeded folder, which is itself below the bookmarks bar.
  type Level = { title: string; children: Level[] };
  let deepest: Level = { title: 'Deep 12', children: [] };
  for (let depth = 11; depth >= 1; depth -= 1) {
    deepest = { title: `Deep ${depth}`, children: [deepest] };
  }
  const seeded = await seedFolder(extensionWorker, 'E2E Deep', [deepest]);
  await page.goto(managerUrl(extensionId, seeded.ids['Deep 12']));
  await expect(breadcrumbCurrent(page)).toHaveText('Deep 12');

  // Rows past the configured depth indent no further and show their depth.
  const padding = (title: string) =>
    treeFolder(page, title).evaluate((row) => getComputedStyle(row).paddingLeft);
  expect(await padding('Deep 12')).toBe(await padding('Deep 5'));
  expect(await padding('Deep 4')).not.toBe(await padding('Deep 5'));
  await expect(treeFolder(page, 'Deep 12').getByTestId('tree-depth')).toHaveText('13');
  await expect(treeFolder(page, 'Deep 5').getByTestId('tree-depth')).toHaveCount(0);

  // The path shows its first folder, a menu for the middle, and its last folders.
  const breadcrumb = page.getByTestId('breadcrumb');
  // The bar's name differs by browser (Edge: Favorites bar), so it comes from the seed.
  await expect(breadcrumb.getByRole('button', { name: seeded.barTitle })).toBeVisible();
  await expect(breadcrumb.getByRole('button', { name: 'Deep 10' })).toBeVisible();
  await expect(breadcrumb.getByRole('button', { name: 'Deep 3', exact: true })).toHaveCount(0);
  await breadcrumb.getByTestId('breadcrumb-more').click();
  await page.getByRole('menuitem', { name: 'Deep 3', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`id=${seeded.ids['Deep 3']}$`));
  await expect(breadcrumbCurrent(page)).toHaveText('Deep 3');
});
