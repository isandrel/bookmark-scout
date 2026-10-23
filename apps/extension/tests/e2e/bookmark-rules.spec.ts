/**
 * Smart Rules end to end: a rule made in Settings, run from the Tools sidebar on a review that
 * changes nothing until applied, then applied (tags and a move) and undone; and new bookmarks
 * tagged and moved without a review, each only with its own opt-in.
 */
import type { Locator, Worker } from '@playwright/test';
import { readConfigToml } from '../config-files';
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

const { max_rules: maxRules } = readConfigToml('rules/rules.toml') as { max_rules: number };

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
  await editor.getByRole('textbox', { name: 'Add tags' }).blur();
  await expect(editor.locator('[data-slot="list-chip"]')).toHaveText(['dev', 'Code']);
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
  // Rules never see page text, so a search for it is refused rather than matching everything.
  const pageTextError =
    "Smart rules can't search page text. Remove content: and has:content from the search.";
  await query.fill('domain:github.com -has:content');
  await expect(editor.getByText(pageTextError)).toBeVisible();
  await editor.getByRole('button', { name: 'Save' }).click();
  // The search field and the save error both say it.
  await expect(editor.getByRole('alert').filter({ hasText: pageTextError })).toHaveCount(2);
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

/** Text cut off sideways inside `scope`: what a narrow window must not do. */
async function clippedText(scope: Locator) {
  return scope.evaluate((node) =>
    [node, ...node.querySelectorAll('button, p, span, label, h2, h4, a')]
      // Text only screen readers get is 1px wide on purpose; truncated meta lines are allowed.
      .filter(
        (element) =>
          element.clientWidth > 1 &&
          !element.classList.contains('truncate') &&
          element.scrollWidth > element.clientWidth + 1,
      )
      .map((element) => element.textContent),
  );
}

test('the rule editor tests a sample and the review applies in dark theme at 420px; Settings shows the last run and its conflicts with a Review link (R40, PROMPT R3, R5)', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Narrow Rules', [
    { title: 'Repo', url: 'https://github.com/org/repo' },
    { title: 'Lib', url: 'https://github.com/org/lib' },
    { title: 'Dest', children: [] },
    { title: 'Libraries', children: [] },
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
      moveTo: { folderId: ids.Dest, path: 'E2E Narrow Rules / Dest' },
    },
    {
      id: 'lib',
      name: 'Libraries',
      enabled: true,
      query: 'title:lib',
      syntaxVersion: 2,
      addTags: [],
      moveTo: { folderId: ids.Libraries, path: 'E2E Narrow Rules / Libraries' },
    },
  ]);
  await setSettings(extensionWorker, { theme: 'dark', bookmarkRulesDefaultScope: 'folder' });
  await page.setViewportSize({ width: 420, height: 800 });

  // The editor, dark and narrow: the sample test says whether the search matches, locally.
  await page.goto(`chrome-extension://${extensionId}/options.html?category=maintenance`);
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  const panel = page.getByTestId('bookmark-rules');
  await panel.getByRole('button', { name: 'Edit GitHub' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit rule' });
  const sample = editor.getByRole('textbox', { name: 'Test with an address or title' });
  const result = editor.getByTestId('rule-sample-result');
  await expect(result).toHaveText(
    'Type a web address or a title to see whether this search matches it. Nothing is saved or sent.',
  );
  await sample.fill('https://gist.github.com/x');
  await expect(result).toHaveText('Matches this search');
  await expect(result).toHaveAttribute('role', 'status');
  await sample.fill('github.com.evil.test/x');
  await expect(result).toHaveText('Does not match this search');
  await expect.poll(() => clippedText(editor)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: test.info().outputPath('rule-editor-dark-420.png') });
  await editor.getByRole('button', { name: 'Cancel' }).click();
  await expect(editor).toHaveCount(0);
  expect(await readStored(extensionWorker, STORAGE_ITEMS.bookmarkRules)).toHaveLength(2);

  // The review, dark and narrow: Lib is a conflict (two folders), Repo a change.
  await openTools(page, extensionId, seeded.folderId);
  await toolCard(page, 'Smart Rules').getByRole('button', { name: 'Run', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Smart Rules' });
  await expect(review.getByRole('radio', { name: 'Changes (1)' })).toBeVisible();
  await expect(review.getByRole('radio', { name: 'Conflicts (1)' })).toBeVisible();
  await expect.poll(() => clippedText(review)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('rule-review-dark-420.png') });
  await review.getByRole('button', { name: 'Apply 1 change' }).click();
  await expect(review).toHaveCount(0);
  await expect.poll(() => parentOf(extensionWorker, ids.Repo as string)).toBe(ids.Dest);
  expect(await parentOf(extensionWorker, ids.Lib as string)).toBe(seeded.folderId);

  // Settings: each rule's last run, and the conflict with a link to review it where it is.
  await page.goto(`chrome-extension://${extensionId}/options.html?category=maintenance`);
  const rule = (name: string) => panel.getByTestId('bookmark-rule').filter({ hasText: name });
  await expect(rule('GitHub').getByTestId('rule-last-run')).toHaveText(
    /^Last run .+: tagged 1, moved 1, left out 0$/,
  );
  await expect(rule('Libraries').getByTestId('rule-last-run')).toHaveCount(0);
  const conflict = page.getByTestId('rule-conflict');
  await expect(conflict).toHaveCount(1);
  await expect(conflict).toContainText('Lib');
  await expect(conflict).toContainText(
    'Folders the rules named: E2E Narrow Rules / Dest and E2E Narrow Rules / Libraries',
  );
  const link = conflict.getByRole('link', { name: 'Review Lib in the bookmark manager' });
  const href = await link.getAttribute('href');
  expect(href).toBe(
    `chrome-extension://${extensionId}/bookmarks.html?id=${seeded.folderId}#smart-rules`,
  );
  await expect.poll(() => clippedText(page.getByTestId('rule-conflicts'))).toEqual([]);

  // The link opens the manager on that folder with the Tools sidebar on Smart Rules.
  await page.goto(href as string);
  await expect(toolCard(page, 'Smart Rules')).toBeVisible();
});

test('a full rules list says so instead of dropping the new rule', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await writeStored(
    extensionWorker,
    STORAGE_ITEMS.bookmarkRules,
    Array.from({ length: maxRules }, (_, n) => ({
      id: `r${n}`,
      name: `Rule ${n}`,
      enabled: false,
      query: `title:r${n}`,
      syntaxVersion: 2,
      addTags: ['x'],
    })),
  );
  await page.goto(`chrome-extension://${extensionId}/options.html?category=maintenance`);
  const panel = page.getByTestId('bookmark-rules');
  await expect(panel.getByTestId('bookmark-rule')).toHaveCount(maxRules);
  const full = `You have ${maxRules} rules, the most you can keep. Delete one to add another.`;

  await panel.getByRole('button', { name: 'Add rule' }).click();
  // A failure toast puts × before its title.
  await expect(toastRegion(page).getByText(`× ${full}`, { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'New rule' })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Start from a template' }).click();
  await page.getByRole('menuitem').first().click();
  const stored = () => readStored<unknown[]>(extensionWorker, STORAGE_ITEMS.bookmarkRules);
  expect(await stored()).toHaveLength(maxRules);

  // With one deleted, a rule can be added again.
  await panel.getByRole('button', { name: 'Delete Rule 0' }).click();
  await expect.poll(async () => (await stored())?.length).toBe(maxRules - 1);
  await panel.getByRole('button', { name: 'Add rule' }).click();
  await expect(page.getByRole('dialog', { name: 'New rule' })).toBeVisible();
});

test('a rule with a folder cannot be saved before the folder path is read', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Rule Path', [
    { title: 'Target', children: [] },
  ]);
  const target = (seeded.ids as Record<string, string>).Target as string;
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkRules, [
    {
      id: 'gh',
      name: 'GitHub',
      enabled: true,
      query: 'domain:github.com',
      syntaxVersion: 2,
      addTags: [],
      moveTo: { folderId: target, path: 'E2E Rule Path/Target' },
    },
  ]);
  await page.goto(`chrome-extension://${extensionId}/options.html?category=maintenance`);
  const panel = page.getByTestId('bookmark-rules');
  await expect(panel.getByTestId('bookmark-rule')).toHaveCount(1);
  // Hold the editor's read of the tree, as a slow read of a large library would.
  await page.evaluate(() => {
    const scope = globalThis as unknown as { releaseTree?: () => void };
    const held = new Promise<void>((resolve) => {
      scope.releaseTree = resolve;
    });
    for (const api of new Set([
      chrome.bookmarks,
      (globalThis as { browser?: typeof chrome }).browser?.bookmarks,
    ])) {
      if (!api) continue;
      const getTree = api.getTree.bind(api);
      Object.defineProperty(api, 'getTree', {
        configurable: true,
        value: async () => {
          await held;
          return getTree();
        },
      });
    }
  });
  await panel.getByRole('button', { name: 'Edit GitHub' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit rule' });
  await expect(editor.getByTestId('rule-save')).toBeDisabled();

  await page.evaluate(() => (globalThis as unknown as { releaseTree: () => void }).releaseTree());
  await expect(editor.getByTestId('rule-save')).toBeEnabled();
  await editor.getByTestId('rule-save').click();
  await expect(editor).toHaveCount(0);
  const [rule] =
    (await readStored<{ moveTo?: { path: string } }[]>(
      extensionWorker,
      STORAGE_ITEMS.bookmarkRules,
    )) ?? [];
  expect(rule?.moveTo?.path).toMatch(/E2E Rule Path \/ Target$/);
});

test('the rule tags box adds a pasted list whole, and waits for an input method to finish', async ({
  extensionId,
  page,
}) => {
  await page.goto(`chrome-extension://${extensionId}/options.html?category=maintenance`);
  await page.getByTestId('bookmark-rules').getByRole('button', { name: 'Add rule' }).click();
  const editor = page.getByRole('dialog', { name: 'New rule' });
  const tags = editor.getByRole('textbox', { name: 'Add tags' });
  const chips = editor.locator('[data-slot="list-chip"]');

  // Longer than one tag may be, as a whole: the box once cut the paste at that length.
  const pasted = ['reading-list', 'research-notes', 'machine-learning', 'web-development'];
  await tags.focus();
  await page.keyboard.insertText(`${pasted.join(', ')},`);
  await expect(chips).toHaveText(pasted);
  await expect(tags).toHaveValue('');

  // The DevTools protocol drives an input method (Chromium and Edge both have it).
  const session = await page.context().newCDPSession(page);
  // A Japanese input method shows its comma before the text is committed: no tag yet.
  await session.send('Input.imeSetComposition', {
    text: '読書、',
    selectionStart: 3,
    selectionEnd: 3,
  });
  await expect(tags).toHaveValue('読書、');
  await expect(chips).toHaveText(pasted);
  await session.send('Input.insertText', { text: '読書、' });
  await expect(chips).toHaveText([...pasted, '読書']);
  await expect(tags).toHaveValue('');
});
