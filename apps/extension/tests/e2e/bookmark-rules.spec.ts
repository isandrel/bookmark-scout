/**
 * Smart Rules end to end: a rule made in Settings, run from the Tools sidebar on a review that
 * changes nothing until applied, then applied (tags and a move) and undone.
 */
import type { Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { readStored, STORAGE_ITEMS, writeStored } from './storage';
import { openTools, seedFolder, setSettings, toolCard } from './tool-helpers';

async function parentOf(worker: Worker, id: string) {
  return worker.evaluate(
    async (bookmarkId) => (await chrome.bookmarks.get(bookmarkId))[0]?.parentId,
    id,
  );
}

async function tagsOf(worker: Worker, id: string) {
  const metadata = await readStored<Record<string, { tags?: string[] }>>(
    worker,
    STORAGE_ITEMS.bookmarkMetadata,
  );
  return metadata?.[id]?.tags ?? [];
}

test.use({ viewport: { width: 1400, height: 900 } });

test('a rule made in Settings tags and moves matching bookmarks after a review, and undo puts them back', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Rules', [
    { title: 'Repo', url: 'https://github.com/org/repo' },
    { title: 'Gist', url: 'https://gist.github.com/x' },
    { title: 'Recipe', url: 'https://food.e2e.invalid/r' },
    { title: 'Library', children: [] },
  ]);
  const ids = seeded.ids as Record<string, string>;
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata, {
    [ids.Gist as string]: { tags: ['DEV'] },
  });
  await setSettings(extensionWorker, { bookmarkRulesDefaultScope: 'folder' });

  // The rule: GitHub pages get two tags and move to Library.
  await page.goto(`chrome-extension://${extensionId}/options.html?category=maintenance`);
  const panel = page.getByTestId('bookmark-rules');
  await expect(panel).toContainText('No rules yet.');
  await panel.getByRole('button', { name: 'Add rule' }).click();
  const editor = page.getByRole('dialog', { name: 'New rule' });
  await editor.getByRole('textbox', { name: 'Name' }).fill('GitHub');
  await editor.getByRole('textbox', { name: 'Bookmarks that match' }).fill('domain:github.com');
  await expect(editor).toContainText('Matches 2 bookmarks now');
  await editor.getByRole('textbox', { name: 'Add tags' }).fill('dev, Code');
  await editor.getByRole('combobox', { name: 'Move to folder' }).click();
  await page.getByRole('combobox', { name: 'Search...' }).fill('E2E Rules / Library');
  await page.getByRole('option', { name: /E2E Rules \/ Library$/ }).click();
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(editor).toHaveCount(0);
  await expect(panel.getByTestId('bookmark-rule')).toContainText('GitHub');
  expect(await readStored(extensionWorker, STORAGE_ITEMS.bookmarkRules)).toEqual([
    expect.objectContaining({
      name: 'GitHub',
      enabled: true,
      query: 'domain:github.com',
      addTags: ['dev', 'Code'],
      moveTo: { folderId: ids.Library, path: expect.stringMatching(/E2E Rules \/ Library$/) },
    }),
  ]);

  // Running the rules changes nothing until the review is applied.
  await openTools(page, extensionId, seeded.folderId);
  const card = toolCard(page, 'Smart Rules');
  await expect(card).toContainText('1 rule turned on');
  await expect(card.getByRole('combobox')).toContainText('E2E Rules');
  await card.getByRole('button', { name: 'Run', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Smart Rules' });
  await expect(review.getByRole('radio', { name: 'Changes (2)' })).toBeVisible();
  const row = (title: string) => review.getByTestId('rule-item').filter({ hasText: title });
  await expect(row('Repo')).toContainText('Add tags: dev and Code');
  await expect(row('Repo')).toContainText(/Move to: .*E2E Rules \/ Library/);
  // A tag the bookmark already has, in any spelling, is not added again.
  await expect(row('Gist')).toContainText('Add tags: Code');
  await expect(review.getByTestId('rule-item').filter({ hasText: 'Recipe' })).toHaveCount(0);
  expect(await parentOf(extensionWorker, ids.Repo as string)).toBe(seeded.folderId);
  expect(await tagsOf(extensionWorker, ids.Repo as string)).toEqual([]);

  await review.getByRole('button', { name: 'Apply 2 changes' }).click();
  await expect(review).toHaveCount(0);
  await expect.poll(() => parentOf(extensionWorker, ids.Repo as string)).toBe(ids.Library);
  expect(await parentOf(extensionWorker, ids.Gist as string)).toBe(ids.Library);
  expect(await tagsOf(extensionWorker, ids.Repo as string)).toEqual(['dev', 'Code']);
  expect(await tagsOf(extensionWorker, ids.Gist as string)).toEqual(['DEV', 'Code']);

  // Undo puts back both the moves and the tags.
  await toastRegion(page).getByRole('button', { name: 'Undo' }).first().click();
  await expect.poll(() => parentOf(extensionWorker, ids.Repo as string)).toBe(seeded.folderId);
  expect(await parentOf(extensionWorker, ids.Gist as string)).toBe(seeded.folderId);
  await expect.poll(() => tagsOf(extensionWorker, ids.Repo as string)).toEqual([]);
  expect(await tagsOf(extensionWorker, ids.Gist as string)).toEqual(['DEV']);
});

test('templates start turned off, and a run with no rule on says so', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Rule Templates', [
    { title: 'Repo', url: 'https://github.com/org/repo' },
  ]);
  await page.goto(`chrome-extension://${extensionId}/options.html?category=maintenance`);
  const panel = page.getByTestId('bookmark-rules');
  await panel.getByRole('button', { name: 'Start from a template' }).click();
  await page.getByRole('menuitem', { name: 'Tag GitHub pages as development' }).click();
  const rule = panel.getByTestId('bookmark-rule');
  await expect(rule).toContainText('Tag GitHub pages as development');
  await expect(rule.getByRole('checkbox')).not.toBeChecked();

  await openTools(page, extensionId, seeded.folderId);
  await toolCard(page, 'Smart Rules').getByRole('button', { name: 'Run', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Smart Rules' });
  await expect(review).toContainText('No rules are turned on.');
  expect(await readStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata)).toBeFalsy();
});

test('with Tag New Bookmarks on, a bookmark added in the browser gets its rules tags and stays put', async ({
  extensionWorker,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Auto Tag', [
    { title: 'Elsewhere', children: [] },
  ]);
  const target = (seeded.ids as Record<string, string>).Elsewhere as string;
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkRules, [
    {
      id: 'gh',
      name: 'GitHub',
      enabled: true,
      query: 'domain:github.com',
      syntaxVersion: 1,
      addTags: ['development'],
      moveTo: { folderId: target, path: 'E2E Auto Tag/Elsewhere' },
    },
  ]);
  const add = (title: string, url: string) =>
    extensionWorker.evaluate(
      async ({ parentId, title, url }) =>
        (await chrome.bookmarks.create({ parentId, title, url })).id,
      { parentId: seeded.folderId, title, url },
    );

  // Off by default: a bookmark added then is never tagged, even in the same batch.
  const before = await add('Before', 'https://github.com/org/before');
  await setSettings(extensionWorker, { bookmarkRulesAutoTag: true });
  const repo = await add('Repo', 'https://github.com/org/repo');
  const other = await add('Other', 'https://other.e2e.invalid/');
  await expect.poll(() => tagsOf(extensionWorker, repo)).toEqual(['development']);
  expect(await tagsOf(extensionWorker, other)).toEqual([]);
  expect(await tagsOf(extensionWorker, before)).toEqual([]);
  // The rule's move is never made automatically.
  expect(await parentOf(extensionWorker, repo)).toBe(seeded.folderId);
});
