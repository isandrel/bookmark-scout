/**
 * The popup's search row at its narrowest, recent folder chips for folders with the same name,
 * folder matches that hold still under the pointer, and tooltips on tree rows.
 */
import type { Page } from '@playwright/test';
import { readConfigToml } from '../config-files';
import { expect, test, toastRegion } from './fixtures';
import { bookmarkRow, folderRow, openPopup, seedFolder, toggleSearchOption } from './popup-helpers';
import { replaceSettings, STORAGE_ITEMS, seedAIServices, writeStored } from './storage';

// The harness opens the popup as a tab, which gets no activeTab, so saving the current page
// reads it through the optional tabs permission.
test.use({ grantPermissions: ['tabs'] });

const { popup } = readConfigToml('settings/appearance.toml') as {
  popup: { width: { min: number } };
};
const minTextWidth = (
  readConfigToml('ui/popup-search.toml') as { min_text_width_px: { value: number } }
).min_text_width_px.value;

type Box = { label: string; left: number; right: number; top: number; bottom: number };

/** The search row's buttons and the part of the search box left for typing. */
async function searchRowGeometry(page: Page) {
  return page.locator('[data-slot="search-row"]').evaluate((row) => {
    const box = (element: Element, label: string): Box => {
      const rect = element.getBoundingClientRect();
      return { label, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    };
    const input = row.querySelector('input') as HTMLInputElement;
    const style = getComputedStyle(input);
    const px = (value: string) => Number.parseFloat(value) || 0;
    const inputBox = box(input, 'input');
    const text: Box = {
      label: 'typing area',
      left: inputBox.left + px(style.borderLeftWidth) + px(style.paddingLeft),
      right: inputBox.right - px(style.borderRightWidth) - px(style.paddingRight),
      top: inputBox.top,
      bottom: inputBox.bottom,
    };
    const buttons = [...row.querySelectorAll('button')]
      .filter((button) => button.getBoundingClientRect().width > 0)
      .map((button) => box(button, button.getAttribute('aria-label') ?? ''));
    return { width: document.documentElement.clientWidth, text, buttons };
  });
}

const overlaps = (a: Box, b: Box) =>
  a.left < b.right - 0.5 &&
  b.left < a.right - 0.5 &&
  a.top < b.bottom - 0.5 &&
  b.top < a.bottom - 0.5;

async function expectSearchRowFits(page: Page) {
  // Measured after layout settles: the row decides its layout from measured widths.
  await expect
    .poll(async () => {
      const { width, text, buttons } = await searchRowGeometry(page);
      const problems: string[] = [];
      if (text.right - text.left < minTextWidth) {
        problems.push(`typing area ${Math.round(text.right - text.left)}px`);
      }
      for (const button of buttons) {
        if (button.left < 0 || button.right > width) problems.push(`${button.label} off-screen`);
        if (overlaps(button, text)) problems.push(`${button.label} covers the typing area`);
        for (const other of buttons) {
          if (other !== button && other.label < button.label && overlaps(button, other)) {
            problems.push(`${button.label} overlaps ${other.label}`);
          }
        }
      }
      return problems;
    })
    .toEqual([]);
}

for (const language of ['en', 'ja', 'zh_CN'] as const) {
  test(`[${language}] every search row control fits the narrowest popup with AI on`, async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    await replaceSettings(extensionWorker, {
      language,
      aiEnabled: true,
      aiAutoTriggerOnOpen: false,
      popupWidth: popup.width.min,
    });
    // Two services add the service switcher, the most buttons the row can show.
    await seedAIServices(extensionWorker, [
      {
        provider: 'custom',
        id: 'one',
        name: 'One',
        model: 'm',
        credentials: { baseUrl: 'https://e2e.invalid/v1' },
      },
      {
        provider: 'custom',
        id: 'two',
        name: 'Two',
        model: 'm',
        credentials: { baseUrl: 'https://e2e.invalid/v1' },
      },
    ]);
    await seedFolder(extensionWorker, 'E2E Narrow', [
      { title: 'Narrow result', url: 'https://e2e.invalid/n' },
    ]);
    await page.setViewportSize({ width: popup.width.min, height: 500 });
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    const search = page.getByRole('combobox');
    await expect(search).toBeVisible();
    await expect(page.getByTestId('ai-service-switcher')).toBeVisible();
    await page.mouse.move(0, 0);

    await expectSearchRowFits(page);
    // A search adds Clear and Expand all; the row must not need to change for them.
    await search.fill('narrow');
    await expect(bookmarkRow(page, 'Narrow result')).toBeVisible();
    await expectSearchRowFits(page);
    // Every control stays usable: the last one in the row still works.
    await toggleSearchOption(page, /Match Case|大文字|区分大小写/);
    await expect(page.getByTestId('search-options')).toBeInViewport({ ratio: 1 });
  });
}

test('recent folder chips name the parents of folders with the same title', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await replaceSettings(extensionWorker, { language: 'en' });
  const work = await seedFolder(extensionWorker, 'E2E Work', [{ title: 'Inbox', children: [] }]);
  const home = await seedFolder(extensionWorker, 'E2E Home', [{ title: 'Inbox', children: [] }]);
  const unique = await seedFolder(extensionWorker, 'E2E Unique Recent', []);
  await writeStored(extensionWorker, STORAGE_ITEMS.recentFolders, [
    { id: work.ids.Inbox, title: 'Inbox', lastUsed: 3 },
    { id: home.ids.Inbox, title: 'Inbox', lastUsed: 2 },
    { id: unique.folderId, title: 'E2E Unique Recent', lastUsed: 1 },
  ]);

  await openPopup(page, extensionId);
  const chips = page.locator('[data-slot="recent-folder"]');
  await expect(chips).toHaveCount(3);
  const workChip = page.getByRole('button', { name: 'Add to "E2E Work / Inbox"', exact: true });
  const homeChip = page.getByRole('button', { name: 'Add to "E2E Home / Inbox"', exact: true });
  await expect(workChip).toHaveText('InboxE2E Work');
  await expect(homeChip).toHaveText('InboxE2E Home');
  await expect(workChip).toHaveAttribute('title', `Add to "${work.barTitle} / E2E Work / Inbox"`);
  // A unique title shows no parents, but its tooltip still has the whole path.
  const uniqueChip = page.getByRole('button', { name: 'Add to "E2E Unique Recent"', exact: true });
  await expect(uniqueChip).toHaveText('E2E Unique Recent');
  await expect(uniqueChip).toHaveAttribute(
    'title',
    `Add to "${unique.barTitle} / E2E Unique Recent"`,
  );

  await homeChip.click();
  await expect(toastRegion(page).getByText(/Bookmark Added$/)).toBeVisible();
  await expect
    .poll(() =>
      extensionWorker.evaluate(
        async (id) => (await chrome.bookmarks.getChildren(id)).length,
        home.ids.Inbox,
      ),
    )
    .toBe(1);
});

test('folder matches keep their order after a save while the pointer is over them', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await replaceSettings(extensionWorker, { language: 'en', recentFoldersEnabled: false });
  const seeded = await seedFolder(extensionWorker, 'E2E Hold', [
    { title: 'Holdmatch Alpha', children: [] },
    { title: 'Holdmatch Beta', children: [] },
  ]);
  await openPopup(page, extensionId);
  await page
    .getByRole('combobox', { name: 'Search bookmarks, or type a folder name' })
    .fill('holdmatch');
  const rows = page.getByTestId('folder-matches').locator('[data-slot="folder-match"]');
  const order = () =>
    rows.evaluateAll((items) => items.map((item) => item.getAttribute('data-folder-trigger')));
  await expect.poll(order).toEqual([seeded.ids['Holdmatch Alpha'], seeded.ids['Holdmatch Beta']]);

  // Saving makes Beta the most recent folder, which ranks it first; the pointer stays on it.
  await rows.nth(1).click();
  await expect(toastRegion(page).getByText(/Bookmark Added$/)).toBeVisible();
  await expect
    .poll(() =>
      extensionWorker.evaluate(
        async (id) => (await chrome.bookmarks.getChildren(id)).length,
        seeded.ids['Holdmatch Beta'],
      ),
    )
    .toBe(1);
  // Give the recent folder update time to reach the popup before checking nothing moved.
  await page.waitForTimeout(500);
  expect(await order()).toEqual([seeded.ids['Holdmatch Alpha'], seeded.ids['Holdmatch Beta']]);
  await expect(rows.nth(1)).toBeFocused();

  // Once the pointer and focus leave the list, the new ranking shows.
  await page.mouse.move(5, 5);
  await page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' }).focus();
  await expect.poll(order).toEqual([seeded.ids['Holdmatch Beta'], seeded.ids['Holdmatch Alpha']]);
});

test('tree rows show the whole title, and bookmarks their address, on hover', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  // With Show Details on Hover off; on, the hover card shows both (bookmark-hover-card.spec.ts).
  await replaceSettings(extensionWorker, {
    language: 'en',
    popupWidth: popup.width.min,
    showHoverDetails: false,
  });
  const longFolder = 'E2E A folder with a name far too long for the narrowest popup to show';
  const longTitle = 'E2E A bookmark title that keeps going well past what one popup row can show';
  const url = 'https://e2e.invalid/a/long/path?with=query';
  await seedFolder(extensionWorker, longFolder, [{ title: longTitle, url }]);
  await page.setViewportSize({ width: popup.width.min, height: 500 });
  await openPopup(page, extensionId);
  await page
    .getByRole('combobox', { name: 'Search bookmarks, or type a folder name' })
    .fill('keeps going');

  const link = bookmarkRow(page, longTitle).locator('a');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('title', `${longTitle}\n${url}`);
  // The row really cuts the title off, which is why the tooltip is needed.
  const text = link.locator('span.truncate');
  expect(await text.evaluate((span) => span.scrollWidth > span.clientWidth)).toBe(true);
  // Nothing inside the row shows a shorter tooltip over the row's own.
  await expect(link.locator('[title]')).toHaveCount(0);
  await expect(folderRow(page, longFolder).getByRole('treeitem')).toHaveAttribute(
    'title',
    longFolder,
  );
});
