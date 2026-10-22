/**
 * Smart Rules end to end: a rule made in Settings, run from the Tools sidebar on a review that
 * changes nothing until applied, then applied (tags and a move) and undone; and new bookmarks
 * tagged and moved without a review, each only with its own opt-in.
 */
import type { Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { readStored, STORAGE_ITEMS, writeStored } from './storage';
import { openTools, seedFolder, setSettings, showAllTools, toolCard } from './tool-helpers';

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

test('a rule with OR and an excluded term is refused while unbalanced, then reviewed and applied', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E OR Rules', [
    { title: 'Repo', url: 'https://github.com/org/repo' },
    { title: 'Gist', url: 'https://gist.github.com/x' },
    { title: 'Lab', url: 'https://gitlab.com/org/lab' },
    { title: 'Recipe', url: 'https://food.e2e.invalid/r' },
  ]);
  const ids = seeded.ids as Record<string, string>;
  await setSettings(extensionWorker, { bookmarkRulesDefaultScope: 'folder' });

  await page.goto(`chrome-extension://${extensionId}/options.html?category=maintenance`);
  const panel = page.getByTestId('bookmark-rules');
  await panel.getByRole('button', { name: 'Add rule' }).click();
  const editor = page.getByRole('dialog', { name: 'New rule' });
  await editor.getByRole('textbox', { name: 'Name' }).fill('Code hosts');
  const query = editor.getByRole('textbox', { name: 'Bookmarks that match' });
  await editor.getByRole('textbox', { name: 'Add tags' }).fill('code');
  // An unclosed group is never saved: the editor says what is wrong.
  await query.fill('(domain:github.com OR domain:gitlab.com -title:gist');
  await expect(
    editor.getByText('A parenthesis is not closed, so the group runs to the end.'),
  ).toBeVisible();
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(
    editor.getByText('This search cannot be read. Check its operators and dates.'),
  ).toBeVisible();
  expect(await readStored(extensionWorker, STORAGE_ITEMS.bookmarkRules)).toBeFalsy();

  await query.fill('(domain:github.com OR domain:gitlab.com) -title:gist');
  await expect(editor).toContainText('Matches 2 bookmarks now');
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(editor).toHaveCount(0);
  expect(await readStored(extensionWorker, STORAGE_ITEMS.bookmarkRules)).toEqual([
    expect.objectContaining({
      query: '(domain:github.com OR domain:gitlab.com) -title:gist',
      syntaxVersion: 2,
      addTags: ['code'],
    }),
  ]);

  await openTools(page, extensionId, seeded.folderId);
  await toolCard(page, 'Smart Rules').getByRole('button', { name: 'Run', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Smart Rules' });
  await expect(review.getByRole('radio', { name: 'Changes (2)' })).toBeVisible();
  const row = (title: string) => review.getByTestId('rule-item').filter({ hasText: title });
  await expect(row('Repo')).toContainText('Add tags: code');
  await expect(row('Lab')).toContainText('Add tags: code');
  await expect(row('Gist')).toHaveCount(0);
  await expect(row('Recipe')).toHaveCount(0);

  await review.getByRole('button', { name: 'Apply 2 changes' }).click();
  await expect(review).toHaveCount(0);
  await expect.poll(() => tagsOf(extensionWorker, ids.Lab as string)).toEqual(['code']);
  expect(await tagsOf(extensionWorker, ids.Repo as string)).toEqual(['code']);
  expect(await tagsOf(extensionWorker, ids.Gist as string)).toEqual([]);
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

  // The moving template names no folder: the editor opens on it, and it cannot be turned on or
  // saved until a folder is chosen (R19).
  await panel.getByRole('button', { name: 'Start from a template' }).click();
  await page.getByRole('menuitem', { name: 'Move Work / Reading to a folder you choose' }).click();
  const editor = page.getByRole('dialog', { name: 'New rule' });
  await expect(editor.getByRole('textbox', { name: 'Name' })).toHaveValue(
    'Move Work / Reading to a folder you choose',
  );
  await expect(editor.getByRole('textbox', { name: 'Bookmarks that match' })).toHaveValue(
    'folder:"Work / Reading"',
  );
  const turnedOn = editor.getByRole('checkbox', { name: 'Turned on' });
  await expect(turnedOn).toBeDisabled();
  await expect(turnedOn).not.toBeChecked();
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(editor.getByRole('alert')).toHaveText('Add a tag or choose a folder.');
  await expect(panel.getByTestId('bookmark-rule')).toHaveCount(1);
  await editor.getByRole('combobox', { name: 'Move to folder' }).click();
  await page.getByRole('combobox', { name: 'Search...' }).fill('E2E Rule Templates');
  await page.getByRole('option', { name: /E2E Rule Templates$/ }).click();
  await expect(turnedOn).toBeEnabled();
  await expect(turnedOn).not.toBeChecked();
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(editor).toHaveCount(0);
  await expect(panel.getByTestId('bookmark-rule')).toHaveCount(2);
  const stored = await readStored<Array<{ enabled: boolean; moveTo?: { folderId: string } }>>(
    extensionWorker,
    STORAGE_ITEMS.bookmarkRules,
  );
  expect(stored?.[1]).toMatchObject({
    enabled: false,
    addTags: [],
    moveTo: { folderId: seeded.folderId },
  });

  await openTools(page, extensionId, seeded.folderId);
  await toolCard(page, 'Smart Rules').getByRole('button', { name: 'Run', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Smart Rules' });
  await expect(review).toContainText('No rules are turned on.');
  expect(await readStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata)).toBeFalsy();
});

test('with Tag New Bookmarks on and new bookmarks from anywhere, a bookmark added in the browser gets its rules tags and stays put, even when a rule may move new bookmarks', async ({
  extensionId,
  extensionWorker,
  page,
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
      autoMove: true,
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
  // By default only bookmarks saved through Bookmark Scout: one added in the browser is only
  // observed, even when Anywhere is chosen before its batch runs (R4).
  const fromBrowser = await add('Starred', 'https://github.com/org/starred');
  await setSettings(extensionWorker, { bookmarkRulesNewFrom: 'any' });
  const repo = await add('Repo', 'https://github.com/org/repo');
  const other = await add('Other', 'https://other.e2e.invalid/');
  await expect.poll(() => tagsOf(extensionWorker, repo)).toEqual(['development']);
  expect(await tagsOf(extensionWorker, other)).toEqual([]);
  expect(await tagsOf(extensionWorker, before)).toEqual([]);
  expect(await tagsOf(extensionWorker, fromBrowser)).toEqual([]);
  // Tagging never moves, even for a rule that may move new bookmarks.
  expect(await parentOf(extensionWorker, repo)).toBe(seeded.folderId);

  // Settings lists the tagging, and its Undo takes the tags back.
  await page.goto(`chrome-extension://${extensionId}/options.html?category=maintenance`);
  const log = page.getByTestId('rule-auto-log');
  await expect(log.getByTestId('rule-auto-entry')).toHaveCount(1);
  await expect(log.getByRole('heading', { name: 'Changed by rules' })).toBeVisible();
  await expect(log).toContainText('Repo');
  await log.getByRole('button', { name: 'Undo the tags added to Repo' }).click();
  await expect.poll(() => tagsOf(extensionWorker, repo)).toEqual([]);
  await expect(log).toHaveCount(0);
});

test('with Move New Bookmarks on, a rule set to move new bookmarks moves one added in the browser, logs it, and Undo puts it back', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Auto Move', [
    { title: 'Target', children: [] },
  ]);
  const target = (seeded.ids as Record<string, string>).Target as string;
  const add = (title: string, url: string) =>
    extensionWorker.evaluate(
      async ({ parentId, title, url }) =>
        (await chrome.bookmarks.create({ parentId, title, url })).id,
      { parentId: seeded.folderId, title, url },
    );

  // The opt-in is on the rule, next to its folder, and the list says the rule moves on its own.
  await page.goto(`chrome-extension://${extensionId}/options.html?category=maintenance`);
  const panel = page.getByTestId('bookmark-rules');
  await panel.getByRole('button', { name: 'Add rule' }).click();
  const editor = page.getByRole('dialog', { name: 'New rule' });
  await editor.getByRole('textbox', { name: 'Name' }).fill('GitHub');
  await editor.getByRole('textbox', { name: 'Bookmarks that match' }).fill('domain:github.com');
  await editor.getByRole('textbox', { name: 'Add tags' }).fill('dev');
  const autoMove = editor.getByRole('checkbox', { name: 'Move new bookmarks automatically' });
  // No folder, nothing to move to.
  await expect(autoMove).toBeDisabled();
  await editor.getByRole('combobox', { name: 'Move to folder' }).click();
  await page.getByRole('combobox', { name: 'Search...' }).fill('E2E Auto Move / Target');
  await page.getByRole('option', { name: /E2E Auto Move \/ Target$/ }).click();
  await autoMove.click();
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(editor).toHaveCount(0);
  const rule = panel.getByTestId('bookmark-rule');
  await expect(rule.getByTestId('rule-auto-move')).toHaveText('Moves new bookmarks automatically');
  expect(await readStored(extensionWorker, STORAGE_ITEMS.bookmarkRules)).toEqual([
    expect.objectContaining({
      autoMove: true,
      moveTo: { folderId: target, path: expect.stringMatching(/E2E Auto Move \/ Target$/) },
    }),
  ]);

  // Tag New Bookmarks alone never moves. From anywhere: these are added in the browser.
  await setSettings(extensionWorker, { bookmarkRulesAutoTag: true, bookmarkRulesNewFrom: 'any' });
  const tagged = await add('Tagged', 'https://github.com/org/tagged');
  await expect.poll(() => tagsOf(extensionWorker, tagged)).toEqual(['dev']);
  expect(await parentOf(extensionWorker, tagged)).toBe(seeded.folderId);

  // With Move New Bookmarks on too, a new bookmark the rule matches goes to the rule's folder.
  await setSettings(extensionWorker, { bookmarkRulesAutoMove: true });
  await expect(page.getByRole('switch', { name: 'Move New Bookmarks' })).toBeChecked();
  const repo = await add('Repo', 'https://github.com/org/repo');
  const other = await add('Other', 'https://other.e2e.invalid/');
  await expect.poll(() => parentOf(extensionWorker, repo)).toBe(target);
  expect(await tagsOf(extensionWorker, repo)).toEqual(['dev']);
  expect(await parentOf(extensionWorker, other)).toBe(seeded.folderId);
  expect(await parentOf(extensionWorker, tagged)).toBe(seeded.folderId);

  // Listed under Changed by rules, where Undo puts it back.
  const log = page.getByTestId('rule-auto-log');
  const moved = log.locator('[data-testid="rule-auto-entry"][data-kind="move"]');
  await expect(moved).toHaveCount(1);
  await expect(moved).toContainText('Repo');
  await expect(moved).toContainText(/Moved to .*E2E Auto Move \/ Target/);
  await moved.getByRole('button', { name: 'Move Repo back' }).click();
  await expect.poll(() => parentOf(extensionWorker, repo)).toBe(seeded.folderId);
  await expect(toastRegion(page).getByText('✓ Moved back', { exact: true })).toBeVisible();
  await expect(moved).toHaveCount(0);

  // The folder renamed: the rule says its automatic moves stopped, and the next bookmark stays.
  await extensionWorker.evaluate(
    async (id) => chrome.bookmarks.update(id, { title: 'Renamed' }),
    target,
  );
  await expect(rule.getByTestId('rule-auto-move-paused')).toBeVisible();
  const later = await add('Later', 'https://github.com/org/later');
  await expect.poll(() => tagsOf(extensionWorker, later)).toEqual(['dev']);
  expect(await parentOf(extensionWorker, later)).toBe(seeded.folderId);
});

test('a run on the search results changes only them, as one History record, with tags searchable at once and kept in Settings (R16, R20, R21, R41)', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Rule Scope', [
    { title: 'Repo', url: 'https://github.com/org/repo' },
    { title: 'Gist', url: 'https://gist.github.com/x' },
    { title: 'Dest', children: [] },
  ]);
  const ids = seeded.ids as Record<string, string>;
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkRules, [
    {
      id: 'gh',
      name: 'GitHub',
      enabled: true,
      query: 'domain:github.com',
      syntaxVersion: 2,
      addTags: ['code'],
      moveTo: { folderId: ids.Dest, path: 'E2E Rule Scope / Dest' },
    },
  ]);

  // The manager searches for Repo: Smart Rules offers to run on just those results.
  await page.goto(`chrome-extension://${extensionId}/bookmarks.html?id=${seeded.folderId}&q=Repo`);
  await expect(page.locator('tbody tr').filter({ hasText: 'Repo' })).toBeVisible();
  await expect(page.locator('tbody tr').filter({ hasText: 'Gist' })).toHaveCount(0);
  await page.getByTitle('Show tools').click();
  await showAllTools(page);
  const card = toolCard(page, 'Smart Rules');
  await card.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Search results' }).click();
  await expect(card.getByRole('combobox')).toContainText('Search results');
  await card.getByRole('button', { name: 'Run', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Smart Rules' });
  await expect(review.getByRole('radio', { name: 'Changes (1)' })).toBeVisible();
  // A bookmark outside the results is never planned (R16).
  await expect(review.getByTestId('rule-item').filter({ hasText: 'Gist' })).toHaveCount(0);
  await review.getByRole('button', { name: 'Apply 1 change' }).click();
  await expect(review).toHaveCount(0);
  await expect.poll(() => parentOf(extensionWorker, ids.Repo as string)).toBe(ids.Dest);
  expect(await parentOf(extensionWorker, ids.Gist as string)).toBe(seeded.folderId);
  expect(await tagsOf(extensionWorker, ids.Repo as string)).toEqual(['code']);
  expect(await tagsOf(extensionWorker, ids.Gist as string)).toEqual([]);

  // The move is one verified record in the History, from Smart Rules (R21).
  await toastRegion(page).getByTestId('view-in-history').click();
  const history = page.getByTestId('history-dialog');
  const record = history.getByTestId('history-record').first();
  await expect(record.getByTestId('history-record-label')).toHaveText('Move "Repo" (Smart Rules)');
  await expect(record.getByTestId('history-record-status')).toHaveText('Verified');
  await expect(record.getByTestId('history-item')).toHaveCount(1);
  await expect(record.getByTestId('history-item')).toContainText('Repo');
  await page.keyboard.press('Escape');
  await expect(history).toBeHidden();

  // The tag it added finds the bookmark at once (R20).
  const search = page.getByRole('textbox', { name: 'Search titles, addresses, folders, and tags' });
  await search.fill('tag:code');
  await expect(page.locator('tbody tr').filter({ hasText: 'Repo' })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(1);

  // Settings keeps the run's tags, after the toast is gone, with an Undo for them (R41).
  await page.goto(`chrome-extension://${extensionId}/options.html?category=maintenance`);
  const entry = page.locator('[data-testid="rule-auto-entry"][data-kind="run"]');
  await expect(entry).toContainText('Smart Rules run');
  await expect(entry).toContainText('Tagged: 1 · Moved: 1');
  await entry.getByRole('button', { name: 'Undo the tags this run added' }).click();
  await expect.poll(() => tagsOf(extensionWorker, ids.Repo as string)).toEqual([]);
  await expect(entry).toHaveCount(0);
  // Its move stays: that is undone from the History.
  expect(await parentOf(extensionWorker, ids.Repo as string)).toBe(ids.Dest);
});
