/**
 * Journey: Ask AI in the popup proposes moving a bookmark, the user approves the plan, a bookmark
 * manager that was already open shows the move, and the manager's undo puts the bookmark back.
 */
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { stubPlanningProvider } from './ai-helpers';
import { expect, test, toastRegion } from './fixtures';
import { managerRow, managerUrl, treeFolder } from './manager-helpers';
import { childTitles, seedFolder } from './popup-helpers';
import { replaceSettings, seedAIServices } from './storage';

const BASE_URL = 'https://journey-plan.e2e.invalid/v1';

test.use({ viewport: { width: 1400, height: 900 } });

type Journey = { context: BrowserContext; extensionId: string; worker: Worker; popup: Page };

/**
 * Opens the manager on the Inbox, approves Ask AI's plan to move the guide to Rust in the popup,
 * and checks the open manager followed the move. Returns the manager, showing Rust.
 */
async function approveMoveWithManagerOpen({ context, extensionId, worker, popup }: Journey) {
  await replaceSettings(worker, { language: 'en', aiEnabled: true, aiAutoTriggerOnOpen: false });
  await seedAIServices(worker, [
    { provider: 'custom', model: 'ask-model', credentials: { baseUrl: BASE_URL } },
  ]);
  const inbox = await seedFolder(worker, 'Inbox', [
    { title: 'Ownership guide', url: 'https://rust.e2e.invalid/ownership' },
    { title: 'Unrelated note', url: 'https://e2e.invalid/note' },
  ]);
  const rust = await seedFolder(worker, 'Rust', []);
  const bookmarkId = inbox.ids['Ownership guide'];
  await stubPlanningProvider(context, BASE_URL, { bookmarkId, folderId: rust.folderId });

  const manager = await context.newPage();
  await manager.goto(managerUrl(extensionId, inbox.folderId));
  await expect(managerRow(manager, 'Ownership guide')).toHaveCount(1);

  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByRole('button', { name: 'Ask AI about your bookmarks or this page' }).click();
  const chat = popup.getByTestId('ask-ai');
  const box = chat.getByRole('textbox', { name: /Ask about your bookmarks/ });
  await box.fill('Move my ownership guide to Rust');
  await box.press('Enter');
  const approval = chat.getByTestId('ask-ai-approval');
  await expect(approval.getByRole('listitem')).toHaveText(
    /^Move “Ownership guide” from .+\/Inbox to .+\/Rust$/,
  );
  // Nothing moves before the approval.
  expect(await childTitles(worker, inbox.folderId)).toEqual(['Ownership guide', 'Unrelated note']);
  await approval.getByRole('button', { name: 'Approve' }).click();
  await expect(chat.getByText('Moved it to Rust.')).toBeVisible();
  expect(await childTitles(worker, rust.folderId)).toEqual(['Ownership guide']);

  // The open manager follows the move without a reload.
  await expect(managerRow(manager, 'Ownership guide')).toHaveCount(0);
  await expect(managerRow(manager, 'Unrelated note')).toHaveCount(1);
  await treeFolder(manager, 'Rust').click();
  await expect(managerRow(manager, 'Ownership guide')).toHaveCount(1);
  return { manager, inboxId: inbox.folderId, rustId: rust.folderId };
}

test('[mocked provider contract] an approved Ask AI move shows in the manager, and its undo restores it', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const { manager, inboxId, rustId } = await approveMoveWithManagerOpen({
    context,
    extensionId,
    worker: extensionWorker,
    popup: page,
  });

  // The approved plan is one step in the manager's history: undo puts it back, redo moves it again.
  await managerRow(manager, 'Ownership guide').click({ position: { x: 200, y: 10 } });
  await manager.keyboard.press('ControlOrMeta+z');
  await expect(toastRegion(manager)).toContainText('Undone: Move');
  await expect(managerRow(manager, 'Ownership guide')).toHaveCount(0);
  await expect
    .poll(() => childTitles(extensionWorker, inboxId))
    .toEqual(['Ownership guide', 'Unrelated note']);
  expect(await childTitles(extensionWorker, rustId)).toEqual([]);

  await manager.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => childTitles(extensionWorker, rustId)).toEqual(['Ownership guide']);
  await expect(managerRow(manager, 'Ownership guide')).toHaveCount(1);
});

test('[mocked provider contract] undoing an approved Ask AI move names the bookmark', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const { manager } = await approveMoveWithManagerOpen({
    context,
    extensionId,
    worker: extensionWorker,
    popup: page,
  });
  await managerRow(manager, 'Ownership guide').click({ position: { x: 200, y: 10 } });
  await manager.keyboard.press('ControlOrMeta+z');
  await expect(
    toastRegion(manager).getByText('✓ Undone: Move "Ownership guide"', { exact: true }),
  ).toBeVisible();
});
