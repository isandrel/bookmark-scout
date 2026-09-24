import { expect, test } from './fixtures';
import { openTools, seedFolder, setSettings, toolCard } from './tool-helpers';

// Obviously synthetic token shape; not a real credential.
const FAKE_GITHUB_TOKEN = `ghp_${'a'.repeat(36)}`;

test('privacy scanner rates credentials and tokens high and ignores asset names and SPA routes', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Privacy Signals', [
    { title: 'Basic Auth', url: 'https://user:password@e2e.invalid/admin' },
    { title: 'Fragment Token', url: 'https://e2e.invalid/cb#access_token=abc' },
    { title: 'Token Value', url: `https://e2e.invalid/x?q=${FAKE_GITHUB_TOKEN}` },
    { title: 'Anchor', url: 'https://e2e.invalid/docs#install' },
    { title: 'Retina Logo', url: 'https://e2e.invalid/img/logo@2x.png' },
    { title: 'SPA Route', url: 'https://e2e.invalid/#/settings' },
  ]);
  await setSettings(extensionWorker, { privacyScannerDefaultScope: 'all' });

  await openTools(page, extensionId, folder.folderId);
  await toolCard(page, 'Privacy Scanner').getByRole('button', { name: 'Scan' }).click();
  const dialog = page.getByRole('dialog', { name: 'Privacy Scanner' });
  const row = (title: string) =>
    dialog.locator('div.rounded-lg').filter({ has: page.getByText(title, { exact: true }) });
  await expect(row('Basic Auth')).toContainText('High');
  await expect(row('Basic Auth')).toContainText('Username and password embedded in URL');
  await expect(row('Basic Auth')).not.toContainText('Email address detected');
  await expect(row('Fragment Token')).toContainText('High');
  await expect(row('Fragment Token')).toContainText(
    'Sensitive value in URL fragment: access_token',
  );
  await expect(row('Token Value')).toContainText('Value looks like an API or access token');
  await expect(row('Anchor')).toContainText('Low');
  await expect(dialog.getByText('Retina Logo', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText('SPA Route', { exact: true })).toHaveCount(0);
});

test('statistics count folders inside the scope and show the depth breakdown only when enabled', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Stats Scope', [
    { title: 'Level One', url: 'https://e2e.invalid/1' },
    {
      title: 'Sub',
      children: [
        { title: 'Level Two', url: 'https://e2e.invalid/2' },
        { title: 'Deeper', children: [{ title: 'Level Three', url: 'https://e2e.invalid/3' }] },
      ],
    },
  ]);
  await setSettings(extensionWorker, {
    statisticsDefaultScope: 'folder',
    statisticsIncludeDepthBreakdown: false,
  });

  await openTools(page, extensionId, folder.folderId);
  const card = toolCard(page, 'Bookmark Statistics');
  await card.getByRole('button', { name: 'View' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bookmark Statistics' });
  const stat = (label: string) => dialog.getByText(label, { exact: true }).locator('..');
  await expect(stat('Bookmarks')).toContainText('3');
  await expect(stat('Folders')).toContainText('2');
  await expect(stat('Deepest level')).toContainText('3');
  await expect(dialog.getByText('Bookmarks by folder level')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await setSettings(extensionWorker, { statisticsIncludeDepthBreakdown: true });
  await card.getByRole('button', { name: 'View' }).click();
  const breakdown = dialog.getByText('Bookmarks by folder level').locator('..');
  await expect(breakdown).toContainText('Level 1');
  await expect(breakdown).toContainText('Level 2');
  await expect(breakdown).toContainText('Level 3');
});
