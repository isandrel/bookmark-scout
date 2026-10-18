import type { Locator, Page, Worker } from '@playwright/test';
import { openAIOptions } from '../e2e/ai-helpers';
import { expect, test, toastRegion } from '../e2e/fixtures';
import {
  bookmarksWithUrl,
  clickToastButton,
  finishedRecord,
  pressShortcut,
  toastTexts,
} from '../e2e/quick-save-helpers';
import { readStored, STORAGE_ITEMS } from '../e2e/storage';
import { openTools, toolCard } from '../e2e/tool-helpers';
import { type LiveAIConfig, liveAI, SKIP_REASON } from './live-env';
import {
  AI_TIMEOUT,
  ARTICLES,
  childrenOf,
  configureLiveAI,
  expectKeyKeptPrivate,
  type LocalSite,
  parentOf,
  seedLibrary,
  startLocalSite,
} from './live-helpers';

/**
 * Real AI features end to end against a real OpenAI-compatible provider (tests/live/README.md).
 * A real model words things its own way, so these check structure and outcomes (a suggestion
 * names a real folder, the bookmark moved, metadata was stored), never exact text.
 */
test.skip(!liveAI, SKIP_REASON);
// Website access stands in for the provider address the user grants, for the quick save
// notification, and for reading the local pages; `tabs` lets the popup (opened as a tab) read the
// current page.
test.use({ grantWebHostAccess: true, grantPermissions: ['tabs'] });
test.setTimeout(6 * 60_000);

/** Set whenever a test runs: the file-level skip covers a missing configuration. */
const ai = liveAI as LiveAIConfig;

let site: LocalSite;
test.beforeEach(async () => {
  site = await startLocalSite();
});
test.afterEach(async () => {
  await site.close();
});

test('[live provider] Verify Service reaches the provider with the configured model', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await configureLiveAI(extensionWorker, ai);
  await openAIOptions(page, extensionId);
  await page.getByRole('button', { name: 'Verify Service' }).click();
  await expect(
    page.getByTestId('ai-service-status').getByText('Service verified', { exact: true }),
  ).toBeVisible({ timeout: AI_TIMEOUT });

  await expectKeyKeptPrivate(extensionWorker, ai, ['verifyService']);
});

/** The folder's title, or undefined when it is gone. */
function titleOf(worker: Worker, id: string | undefined) {
  return worker.evaluate(
    async (folderId) => (await chrome.bookmarks.get(folderId).catch(() => []))[0]?.title,
    id ?? '',
  );
}

test('[live provider] popup folder suggestions name real folders and save the page to the first', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedLibrary(extensionWorker, site);
  await configureLiveAI(extensionWorker, ai, { aiMaxRecommendations: 3 });
  const article = site.url('rust-lifetimes');
  await page.goto(article);
  await expect(page).toHaveTitle(ARTICLES['rust-lifetimes'].title);
  const tabId = await extensionWorker.evaluate(
    async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url)?.id,
    article,
  );
  if (tabId === undefined) throw new Error('The article tab was not found');

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await extensionWorker.evaluate((id) => chrome.tabs.update(id, { active: true }), tabId);
  await popup.getByTitle('AI folder recommendation').click();

  const suggestions = popup
    .getByTestId('ai-suggestions')
    .locator('[data-slot=ai-suggestion-list] button');
  await expect(suggestions.first()).toBeVisible({ timeout: AI_TIMEOUT });
  // The path, without the confidence after it.
  const path = (await suggestions.first().locator('span').first().innerText()).trim();
  const lastSegment = path
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .at(-1);
  expect(lastSegment, 'the first suggestion names a folder').toBeTruthy();

  await suggestions.first().click();
  // An existing folder saves at once; a new one is reviewed first.
  const review = popup.getByRole('dialog', { name: 'Review new folder' });
  await expect
    .poll(
      async () =>
        (await review.isVisible()) || (await bookmarksWithUrl(extensionWorker, article)).length > 0,
    )
    .toBe(true);
  if (await review.isVisible()) {
    await review.getByRole('button', { name: 'Create Folder and Save' }).click();
  }
  await expect.poll(() => bookmarksWithUrl(extensionWorker, article)).toHaveLength(1);
  const [saved] = await bookmarksWithUrl(extensionWorker, article);
  expect(await titleOf(extensionWorker, saved.parentId)).toBe(lastSegment);

  await expectKeyKeptPrivate(extensionWorker, ai, ['folderRecommendation']);
});

test('[live provider] AI quick save files the page, names the folder, and Undo removes it', async ({
  context,
  extensionWorker,
}) => {
  await seedLibrary(extensionWorker, site);
  await configureLiveAI(extensionWorker, ai, { aiMaxRecommendations: 3 });
  const page = await context.newPage();
  await page.goto(site.url('rust-lifetimes'));
  await expect(page).toHaveTitle(ARTICLES['rust-lifetimes'].title);

  await pressShortcut(extensionWorker, page, 'ai-quick-save');
  const record = await finishedRecord(extensionWorker, { timeout: AI_TIMEOUT });
  expect(record.status).toBe('saved');
  const [saved] = await bookmarksWithUrl(extensionWorker, page.url());
  expect(saved?.parentId).toBe(record.folderId);
  const folder = await titleOf(extensionWorker, record.folderId);
  expect(folder).toBeTruthy();
  await expect.poll(() => toastTexts(page)).toContain(`Saved to ${folder}`);

  await clickToastButton(page, 'Undo');
  await expect.poll(() => bookmarksWithUrl(extensionWorker, page.url())).toEqual([]);
  await expect.poll(() => toastTexts(page)).toContain('Bookmark removed');

  await expectKeyKeptPrivate(extensionWorker, ai, ['folderRecommendation']);
});

/** Waits until Ask AI has answered and is idle, failing at once on an error it shows. */
async function waitForAnswer(chat: Locator, page: Page, minMessages: number) {
  const messages = chat.getByTestId('ask-ai-message');
  const deadline = Date.now() + AI_TIMEOUT;
  while (Date.now() < deadline) {
    const alert = chat.getByRole('alert');
    if ((await alert.count()) > 0) {
      throw new Error(`Ask AI showed an error: ${await alert.first().innerText()}`);
    }
    const count = await messages.count();
    const idle = (await chat.getByRole('button', { name: 'Stop', exact: true }).count()) === 0;
    if (
      idle &&
      count >= minMessages &&
      (await messages.last().getAttribute('data-role')) === 'assistant'
    ) {
      return;
    }
    await page.waitForTimeout(500);
  }
  throw new Error('Ask AI did not finish answering in time');
}

async function ask(chat: Locator, page: Page, text: string) {
  const before = await chat.getByTestId('ask-ai-message').count();
  const box = chat.getByRole('textbox', { name: /Ask about your bookmarks/ });
  await box.fill(text);
  await box.press('Enter');
  // The question and its answer.
  await waitForAnswer(chat, page, before + 2);
}

test('[live provider] Ask AI answers from bookmarks with tools, and moves one only after approval', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const library = await seedLibrary(extensionWorker, site);
  await configureLiveAI(extensionWorker, ai);
  const asyncBookmark = library.bookmarks[ARTICLES['rust-async'].title];
  const inbox = library.folders.Inbox;
  const rust = library.folders['Programming/Rust'];

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole('button', { name: 'Ask AI about your bookmarks or this page' }).click();
  const chat = page.getByTestId('ask-ai');

  await ask(
    chat,
    page,
    'Which bookmarks have I saved about the Rust programming language? Search my bookmarks and list their titles.',
  );
  await expect(chat.getByTestId('ask-ai-tool').first()).toBeVisible();
  await expect(
    chat.locator('[data-testid="ask-ai-message"][data-role="assistant"]').last(),
  ).toContainText(/ownership|borrowing|cargo/i);

  // Suggestion buttons are the model's choice; a next question, when offered, asks it.
  const nextQuestion = chat.locator('[data-testid="ask-ai-suggestions"] [data-kind="ask"]:enabled');
  if ((await nextQuestion.count()) > 0) {
    const before = await chat.getByTestId('ask-ai-message').count();
    await nextQuestion.first().click();
    await waitForAnswer(chat, page, before + 2);
  }

  await chat.getByRole('button', { name: 'New chat' }).click();
  await expect(chat.getByTestId('ask-ai-message')).toHaveCount(0);
  const box = chat.getByRole('textbox', { name: /Ask about your bookmarks/ });
  await box.fill(
    `Move my bookmark "${ARTICLES['rust-async'].title}" from the Inbox folder into the folder Programming/Rust.`,
  );
  await box.press('Enter');

  // The move waits for the user, and nothing has moved yet.
  const approval = chat.getByTestId('ask-ai-approval');
  await expect(approval).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(approval.getByRole('listitem').first()).toBeVisible();
  expect(await parentOf(extensionWorker, asyncBookmark)).toBe(inbox);
  await approval.getByRole('button', { name: 'Approve' }).click();
  await expect
    .poll(() => parentOf(extensionWorker, asyncBookmark), { timeout: AI_TIMEOUT })
    .toBe(rust);
  await waitForAnswer(chat, page, 2);

  // Undo through the chat, approving it if the extension asks.
  const before = await chat.getByTestId('ask-ai-message').count();
  await box.fill('Undo the move you just made.');
  await box.press('Enter');
  await expect
    .poll(
      async () => {
        const approve = chat
          .getByTestId('ask-ai-approval')
          .getByRole('button', { name: 'Approve' });
        for (const button of await approve.all()) {
          if (await button.isEnabled()) await button.click();
        }
        return parentOf(extensionWorker, asyncBookmark);
      },
      { timeout: AI_TIMEOUT, intervals: [1_000] },
    )
    .toBe(inbox);
  await waitForAnswer(chat, page, before + 2);

  await expectKeyKeptPrivate(extensionWorker, ai, ['askAI']);
});

type StoredMetadata = Record<string, { tags?: string[]; summary?: string }>;

/** Bookmarks in `ids` whose stored metadata passes `has`. */
async function withMetadata(
  worker: Worker,
  ids: readonly string[],
  has: (entry: { tags?: string[]; summary?: string }) => boolean,
) {
  const metadata = (await readStored<StoredMetadata>(worker, STORAGE_ITEMS.bookmarkMetadata)) ?? {};
  return ids.filter((id) => metadata[id] && has(metadata[id])).length;
}

test('[live provider] Auto-Tagging, Summarizer, and AI reorganization review, apply, and undo', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const library = await seedLibrary(extensionWorker, site);
  await configureLiveAI(extensionWorker, ai, {
    autoTaggingEnabled: true,
    summarizerEnabled: true,
    reorganizationEnabled: true,
    reorganizationMinConfidence: 0.3,
  });
  const unsorted = library.folders.Unsorted;
  const original = await childrenOf(extensionWorker, unsorted);
  const ids = original.map((item) => item.id);
  await openTools(page, extensionId, unsorted);

  // Auto-Tagging: review, then save the tags.
  await toolCard(page, 'Auto-Tagging').getByRole('button', { name: 'Analyze' }).click();
  const tagging = page.getByRole('dialog', { name: 'Auto-Tagging' });
  await tagging.getByRole('button', { name: 'Save Suggested Tags' }).click({ timeout: AI_TIMEOUT });
  await expect
    .poll(() => withMetadata(extensionWorker, ids, (entry) => (entry.tags?.length ?? 0) > 0))
    .toBeGreaterThan(0);
  if (await tagging.isVisible()) await page.keyboard.press('Escape');
  await expect(tagging).toHaveCount(0);

  // Summarizer: review, then save the summaries.
  await toolCard(page, 'Content Summarizer').getByRole('button', { name: 'Analyze' }).click();
  const summarizer = page.getByRole('dialog', { name: 'Content Summarizer' });
  await summarizer
    .getByRole('button', { name: 'Save Suggested Summaries' })
    .click({ timeout: AI_TIMEOUT });
  await expect
    .poll(() => withMetadata(extensionWorker, ids, (entry) => Boolean(entry.summary?.trim())))
    .toBeGreaterThan(0);
  if (await summarizer.isVisible()) await page.keyboard.press('Escape');
  await expect(summarizer).toHaveCount(0);
  // Tags and summaries change metadata only, never the bookmarks.
  expect(await childrenOf(extensionWorker, unsorted)).toEqual(original);

  // Reorganization: the plan is a dry run until applied.
  await toolCard(page, 'AI Folder Reorganization').getByRole('button', { name: 'Analyze' }).click();
  const reorganization = page.getByRole('dialog', { name: 'AI Folder Reorganization' });
  const apply = reorganization.getByRole('button', { name: 'Apply Changes' });
  await expect(apply).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(reorganization.getByText(/^Bookmark moves: [1-9]\d*$/)).toBeVisible();
  expect(await childrenOf(extensionWorker, unsorted)).toEqual(original);
  await apply.click();
  await expect
    .poll(async () => {
      const parents = await Promise.all(ids.map((id) => parentOf(extensionWorker, id)));
      return parents.filter((parent) => parent !== unsorted).length;
    })
    .toBeGreaterThan(0);

  // A complete run closes the review and offers Undo in the toast; a partial one keeps it open.
  const reviewUndo = reorganization.getByRole('button', { name: 'Undo', exact: true });
  if (await reviewUndo.isVisible()) {
    await reviewUndo.click();
  } else {
    // The tag and summary saves left toasts with their own Undo.
    await toastRegion(page)
      .getByRole('status', { includeHidden: true })
      .filter({ hasText: 'Reorganization Complete' })
      .getByRole('button', { name: 'Undo', exact: true })
      .click();
  }
  await expect(
    toastRegion(page).getByText('✓ Reorganization undone', { exact: true }),
  ).toBeVisible();
  // Every bookmark is back, and the folders the run created are gone.
  const byId = (items: { id: string }[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));
  await expect
    .poll(async () => byId(await childrenOf(extensionWorker, unsorted)))
    .toEqual(byId(original));

  await expectKeyKeptPrivate(extensionWorker, ai, ['autoTagging', 'summarizer', 'reorganization']);
});

test('[live provider] Auto-Tagging writes tags in the AI output language', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const library = await seedLibrary(extensionWorker, site);
  // English pages and an English extension, with tags asked for in Japanese.
  await configureLiveAI(extensionWorker, ai, { autoTaggingEnabled: true, aiOutputLanguage: 'ja' });
  const unsorted = library.folders.Unsorted;
  const ids = (await childrenOf(extensionWorker, unsorted)).map((item) => item.id);
  await openTools(page, extensionId, unsorted);

  await toolCard(page, 'Auto-Tagging').getByRole('button', { name: 'Analyze' }).click();
  const tagging = page.getByRole('dialog', { name: 'Auto-Tagging' });
  await tagging.getByRole('button', { name: 'Save Suggested Tags' }).click({ timeout: AI_TIMEOUT });
  const japanese = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
  const inJapanese = (entry: { tags?: string[] }) =>
    (entry.tags ?? []).some((tag) => japanese.test(tag));
  await expect.poll(() => withMetadata(extensionWorker, ids, inJapanese)).toBeGreaterThan(0);

  await expectKeyKeptPrivate(extensionWorker, ai, ['autoTagging']);
});
