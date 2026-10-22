/**
 * The review list every tool's review shares (`ReviewList`): switching category tabs after
 * scrolling shows the new tab's rows from the top, with no blank space left above them.
 */
import { expect, test } from './fixtures';
import { openTools, seedFolder, setSettings, toolCard } from './tool-helpers';

const ARTICLE = `<!doctype html><html><head><title>Notes</title></head><body><article>
<h1>Notes</h1><p>${'Plenty of notes about the trip and what we saw on the way. '.repeat(20)}</p>
</article></body></html>`;
const SIGN_IN = `<!doctype html><html><head><title>Sign in</title></head><body><main>
<h1>Sign in to keep reading</h1><form><input name="user"><input type="password" name="pw">
<button>Sign in</button></form></main></body></html>`;
const ARTICLE_COUNT = 40;

test.use({ grantWebHostAccess: true });

test('switching review tabs after scrolling starts each tab at its top, with no blank space above a short tab', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Review Tabs', [
    ...Array.from({ length: ARTICLE_COUNT }, (_, index) => ({
      title: `Article ${index + 1}`,
      url: `https://notes.e2e.invalid/${index + 1}`,
    })),
    { title: 'Members only', url: 'https://login.e2e.invalid/story' },
  ]);
  await page.context().route('https://*.e2e.invalid/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: route.request().url().startsWith('https://login.') ? SIGN_IN : ARTICLE,
    }),
  );
  await setSettings(extensionWorker, { pageTextEnabled: true, pageTextDefaultScope: 'folder' });

  await openTools(page, extensionId, folder.folderId);
  await toolCard(page, 'Index Page Text')
    .getByRole('button', { name: 'Index', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Choose sites to read' })
    .getByRole('button', { name: 'Start with 1 site' })
    .click();
  const review = page.getByRole('dialog', { name: 'Index Page Text' });
  const scroller = review.locator('[data-slot="review-scroll"]');
  const rows = review.getByTestId('page-text-item');
  await expect(review.getByRole('radio', { name: `Text found (${ARTICLE_COUNT})` })).toBeVisible();

  /** Scrolls the list to its end, as a user reading the whole tab would. */
  const scrollToEnd = () =>
    scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
  /** Where the first row sits below the list's top, and how far the list is scrolled. */
  const firstRowPlace = async () => {
    const list = await scroller.boundingBox();
    const row = await rows.first().boundingBox();
    return {
      offset: list && row ? Math.round(row.y - list.y) : undefined,
      scrollTop: await scroller.evaluate((element) => element.scrollTop),
    };
  };

  await scrollToEnd();
  await expect(rows.filter({ hasText: 'Members only' })).toBeVisible();

  // A tab with many rows starts from its first row, not where the last tab was scrolled to.
  await review.getByRole('radio', { name: `Text found (${ARTICLE_COUNT})` }).click();
  await expect(rows.first().getByText('Article 1', { exact: true })).toBeVisible();
  await expect.poll(firstRowPlace).toEqual({ offset: 0, scrollTop: 0 });

  await scrollToEnd();
  await expect(rows.filter({ hasText: `Article ${ARTICLE_COUNT}` })).toBeVisible();
  await review.getByRole('radio', { name: 'Sign-in page (1)' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Members only');
  // The row sits at the top of the list, with no blank space above or below it.
  await expect.poll(firstRowPlace).toEqual({ offset: 0, scrollTop: 0 });
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBe(0);

  // Back on All, the list starts from the top too.
  await review.getByRole('radio', { name: `All (${ARTICLE_COUNT + 1})` }).click();
  await expect(rows.first().getByText('Article 1', { exact: true })).toBeVisible();
  await expect.poll(firstRowPlace).toEqual({ offset: 0, scrollTop: 0 });
});
