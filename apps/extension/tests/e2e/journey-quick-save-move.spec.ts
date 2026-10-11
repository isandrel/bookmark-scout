/**
 * Journey: the quick save shortcut saves a web page, the in-page notification's "Move to" button
 * moves it to another folder, the bookmark manager shows it there, and the manager's Show in
 * folder opens that folder from a search result.
 */
import { expect, test } from './fixtures';
import { breadcrumbCurrent, managerRow, managerUrl } from './manager-helpers';
import { seedFolder, setSettings } from './popup-helpers';
import {
  bookmarksWithUrl,
  clickToastButton,
  finishedRecord,
  pressShortcut,
  routeArticle,
  toastButtons,
  toastTexts,
} from './quick-save-helpers';

// The key press grants activeTab, which a dispatched command does not; website access stands in
// for it so the notification can be drawn in the page.
test.use({ grantWebHostAccess: true, viewport: { width: 1400, height: 900 } });

const ARTICLE_URL = 'https://journey.e2e.invalid/articles/react-hooks-patterns';
const ARTICLE_TITLE = 'React hooks patterns';

test('a quick save moved from the notification shows in the manager, and Show in folder finds it', async ({
  context,
  extensionId,
  extensionWorker,
}) => {
  await setSettings(extensionWorker, { language: 'en', theme: 'light' });
  const react = await seedFolder(extensionWorker, 'React', [
    { title: 'React hooks reference', url: 'https://react.e2e.invalid/reference/hooks' },
  ]);
  const frontend = await seedFolder(extensionWorker, 'Frontend', [
    { title: 'Hooks and components', url: 'https://frontend.e2e.invalid/hooks' },
  ]);
  await routeArticle(context, ARTICLE_URL, ARTICLE_TITLE);
  const article = await context.newPage();
  await article.goto(ARTICLE_URL);
  await expect(article).toHaveTitle(ARTICLE_TITLE);

  // The shortcut saves to the best match; the notification offers the other folder.
  await pressShortcut(extensionWorker, article, 'quick-save');
  const record = await finishedRecord(extensionWorker);
  expect(record).toMatchObject({ status: 'saved', delivery: 'page', folderId: react.folderId });
  await expect.poll(() => toastButtons(article)).toContain('Frontend');
  await clickToastButton(article, 'Frontend');
  await expect
    .poll(() => bookmarksWithUrl(extensionWorker, ARTICLE_URL))
    .toEqual([{ id: record.bookmarkId, parentId: frontend.folderId, title: ARTICLE_TITLE }]);
  await expect.poll(() => toastTexts(article)).toContain('Saved to Frontend');

  // The manager shows it in the folder it moved to, and no longer in the one it left.
  const manager = await context.newPage();
  await manager.goto(managerUrl(extensionId, frontend.folderId));
  await expect(managerRow(manager, ARTICLE_TITLE)).toHaveCount(1);
  await manager.goto(managerUrl(extensionId, react.folderId));
  await expect(managerRow(manager, 'React hooks reference')).toHaveCount(1);
  await expect(managerRow(manager, ARTICLE_TITLE)).toHaveCount(0);

  // A search finds it anywhere; the row's context menu opens its folder with it selected.
  await manager.getByRole('textbox', { name: 'Filter titles' }).fill('hooks patterns');
  await expect(managerRow(manager, ARTICLE_TITLE)).toHaveCount(1);
  await managerRow(manager, ARTICLE_TITLE).click({ button: 'right' });
  await manager.getByRole('menuitem', { name: 'Show in folder' }).click();
  await expect(breadcrumbCurrent(manager)).toHaveText('Frontend');
  await expect(manager).toHaveURL(managerUrl(extensionId, frontend.folderId));
  await expect(managerRow(manager, ARTICLE_TITLE)).toHaveAttribute('data-state', 'selected');
  await expect(managerRow(manager, 'Hooks and components')).toHaveCount(1);
});
