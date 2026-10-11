import type { Worker } from '@playwright/test';
import { streamChunks } from './ai-helpers';
import { expect, test, toastRegion } from './fixtures';
import { childTitles } from './popup-helpers';
import { replaceSettings, seedAIServices } from './storage';

/**
 * A journey across surfaces: a page saved from an Ask AI suggestion button in the popup shows up
 * in the bookmark manager, whose Undo takes it back out, because both use one undo history.
 */

const BASE_URL = 'https://journey.e2e.invalid/v1';

function seedFolders(worker: Worker) {
  return worker.evaluate(async () => {
    const [root] = await chrome.bookmarks.getTree();
    const parent = root.children?.find((node) => node.children !== undefined);
    if (!parent) throw new Error('No writable bookmark root');
    const reading = await chrome.bookmarks.create({ parentId: parent.id, title: 'Reading' });
    await chrome.bookmarks.create({
      parentId: reading.id,
      title: 'Kept article',
      url: 'https://journey.e2e.invalid/kept',
    });
    return reading.id;
  });
}

test('[mocked provider contract] a page saved from an Ask AI button appears in the manager, and the manager undoes it', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await replaceSettings(extensionWorker, { language: 'en', aiEnabled: true });
  await seedAIServices(extensionWorker, [
    { provider: 'custom', model: 'ask-model', credentials: { baseUrl: BASE_URL } },
  ]);
  const folderId = await seedFolders(extensionWorker);
  await context.route(`${BASE_URL}/**`, async (route) => {
    const request = JSON.parse(route.request().postData() ?? '{}') as {
      messages: { role: string }[];
    };
    if (request.messages.at(-1)?.role === 'tool') {
      await streamChunks(route, [{ role: 'assistant', content: 'Saved it for later?' }], 'stop');
      return;
    }
    await streamChunks(
      route,
      [
        {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: 'call_suggest',
              type: 'function',
              function: {
                name: 'suggestActions',
                arguments: JSON.stringify({
                  suggestions: [
                    {
                      kind: 'save',
                      url: 'https://journey.e2e.invalid/new-article',
                      title: 'New article',
                      folder: `f:${folderId}`,
                    },
                  ],
                }),
              },
            },
          ],
        },
      ],
      'tool_calls',
    );
  });

  // Popup: Ask AI offers to save the page; the click saves it.
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole('button', { name: 'Ask AI about your bookmarks or this page' }).click();
  const chat = page.getByTestId('ask-ai');
  const box = chat.getByRole('textbox', { name: /Ask about your bookmarks/ });
  await box.fill('Where should this article go?');
  await box.press('Enter');
  const save = chat.getByRole('list', { name: 'Suggestions' }).getByRole('button', {
    name: /^Save to .+\/Reading$/,
  });
  await save.click();
  await expect(toastRegion(page)).toContainText(/Saved to .+\/Reading/);

  // Manager: the new bookmark is in the folder.
  const manager = await context.newPage();
  await manager.goto(`chrome-extension://${extensionId}/bookmarks.html?id=${folderId}`);
  const newRow = manager.locator('tbody tr').filter({ hasText: 'New article' });
  await expect(newRow).toBeVisible();
  expect(await childTitles(extensionWorker, folderId)).toEqual(['Kept article', 'New article']);

  // The manager's Undo takes back the save made in the popup.
  await manager.locator('tbody tr').first().focus();
  await manager.keyboard.press('ControlOrMeta+z');
  await expect(toastRegion(manager)).toContainText('Undone');
  await expect(newRow).toHaveCount(0);
  await expect.poll(() => childTitles(extensionWorker, folderId)).toEqual(['Kept article']);
});
