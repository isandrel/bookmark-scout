import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Page, Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { childrenOf, openTools, seedFolder, setSettings, toolCard } from './tool-helpers';

type LocalSite = { origin: string; close: () => Promise<void> };

/** A real HTTP server that never sends CORS headers, so only host access lets requests through. */
async function startLocalSite(): Promise<LocalSite> {
  const server: Server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    switch (pathname) {
      case '/plain':
        res.writeHead(200, { 'content-type': 'text/html' });
        return res.end('<title>Plain</title>');
      case '/redirect':
        res.writeHead(302, { location: '/plain' });
        return res.end();
      case '/private':
        res.writeHead(401, { 'content-type': 'text/html' });
        return res.end('<title>Sign in</title>');
      default:
        res.writeHead(404, { 'content-type': 'text/html' });
        return res.end('<title>Not Found</title>');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

/** An origin on a port that was just released, so connections to it are refused. */
async function closedPortOrigin(): Promise<string> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}

let site: LocalSite;
test.beforeEach(async () => {
  site = await startLocalSite();
});
test.afterEach(async () => {
  await site.close();
});
test.use({ grantWebHostAccess: true });

async function seedBrokenLinks(worker: Worker, folderTitle: string) {
  const refused = `${await closedPortOrigin()}/closed`;
  const folder = await seedFolder(worker, folderTitle, [
    { title: 'Plain', url: `${site.origin}/plain` },
    { title: 'Missing', url: `${site.origin}/missing` },
    { title: 'Moved', url: `${site.origin}/redirect` },
    { title: 'Refused', url: refused },
    { title: 'Renamed Page', url: `${site.origin}/old-page` },
    { title: 'Private', url: `${site.origin}/private` },
  ]);
  await setSettings(worker, {
    deadLinksRetryCount: 0,
    deadLinksFollowRedirects: false,
    deadLinksDefaultScope: 'folder',
  });
  return { ...folder, refused };
}

async function openRepairReview(page: Page, extensionId: string, folderId: string) {
  await openTools(page, extensionId, folderId);
  await toolCard(page, 'Check Dead Links').getByRole('button', { name: 'Scan' }).click();
  const results = page.getByRole('dialog', { name: 'Check Dead Links' });
  await expect(results.getByTestId('dead-link-summary')).toContainText(
    'Confirmed dead: 3. Need a manual check: 1. Redirected: 1.',
  );
  await results.getByRole('button', { name: 'Review repairs' }).click();
  const review = page.getByRole('dialog', { name: 'Review dead-link repairs' });
  await expect(review).toBeVisible();
  return review;
}

async function choose(page: Page, title: string, option: string) {
  const review = page.getByRole('dialog', { name: 'Review dead-link repairs' });
  await review.getByRole('combobox', { name: `Action for ${title}` }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('dead-link scan separates confirmed dead links from ones that need a manual check', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedBrokenLinks(extensionWorker, 'E2E Repair Classify');
  const review = await openRepairReview(page, extensionId, folder.folderId);
  const row = (title: string) =>
    review
      .getByTestId('dead-link-repair-item')
      .filter({ has: page.getByText(title, { exact: true }) });

  // Confirmed dead links are listed first; the reachable bookmark is not offered for repair.
  await expect(review.getByTestId('dead-link-repair-item')).toHaveCount(5);
  await expect(review.getByTestId('dead-link-repair-item').first()).toContainText('Missing');
  await expect(row('Missing')).toContainText('HTTP 404: Page not found');
  await expect(row('Missing')).toContainText('Confirmed dead');
  await expect(row('Refused')).toContainText('Could not connect to the site');
  await expect(row('Refused')).toContainText('Confirmed dead');
  await expect(row('Private')).toContainText(
    'HTTP 401: Sign-in required or access denied; it may work in your browser',
  );
  await expect(row('Private')).toContainText('Check manually');
  await expect(row('Moved')).toContainText(`Redirects to ${site.origin}/plain`);
  await expect(row('Plain')).toHaveCount(0);

  // Nothing is planned by default, and the redirect choice only exists where a redirect was seen.
  await expect(review.getByTestId('dead-link-repair-summary')).toHaveText(
    'Delete: 0. Replace URL: 0. Keep: 5.',
  );
  await expect(review.getByRole('button', { name: 'Apply 0 changes' })).toBeDisabled();
  await review.getByRole('combobox', { name: 'Action for Missing' }).click();
  await expect(page.getByRole('option')).toHaveText([
    'Keep as is',
    'Delete bookmark',
    'Use archived copy (Wayback Machine)',
    'Edit URL',
  ]);
  await page.keyboard.press('Escape');
  await review.getByRole('combobox', { name: 'Action for Moved' }).click();
  await expect(page.getByRole('option', { name: 'Use redirect target' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('applies each reviewed repair only after Apply, and undo restores the batch', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedBrokenLinks(extensionWorker, 'E2E Repair Apply');
  const original = await childrenOf(extensionWorker, folder.folderId);
  const review = await openRepairReview(page, extensionId, folder.folderId);

  await choose(page, 'Missing', 'Delete bookmark');
  await choose(page, 'Moved', 'Use redirect target');
  await choose(page, 'Refused', 'Use archived copy (Wayback Machine)');
  await choose(page, 'Renamed Page', 'Edit URL');
  const editField = review.getByRole('textbox', { name: 'New URL for Renamed Page' });
  await editField.fill('javascript:alert(1)');
  await expect(review).toContainText(
    'Enter a valid http or https URL that differs from the current one.',
  );
  await expect(review.getByRole('button', { name: /^Apply/ })).toBeDisabled();
  await editField.fill(`${site.origin}/new-page`);
  await expect(review).toContainText(
    `New URL: https://web.archive.org/web/${folder.refused}`,
  );
  await expect(review.getByTestId('dead-link-repair-summary')).toHaveText(
    'Delete: 1. Replace URL: 3. Keep: 1.',
  );
  // Reviewing alone changes nothing.
  expect(await childrenOf(extensionWorker, folder.folderId)).toEqual(original);

  await review.getByRole('button', { name: 'Apply 4 changes' }).click();
  await expect(toastRegion(page).getByText('Repairs applied', { exact: true })).toBeVisible();
  await expect(
    toastRegion(page).getByText(
      'Deleted: 1. URLs replaced: 3. Skipped because they changed after the scan: 0. Failed: 0.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(review).toHaveCount(0);
  await expect
    .poll(async () =>
      (await childrenOf(extensionWorker, folder.folderId)).map((item) => [item.title, item.url]),
    )
    .toEqual([
      ['Plain', `${site.origin}/plain`],
      ['Moved', `${site.origin}/plain`],
      ['Refused', `https://web.archive.org/web/${folder.refused}`],
      ['Renamed Page', `${site.origin}/new-page`],
      ['Private', `${site.origin}/private`],
    ]);

  await toastRegion(page).getByRole('button', { name: 'Undo' }).click();
  await expect(toastRegion(page).getByText('Repairs undone', { exact: true })).toBeVisible();
  await expect
    .poll(async () =>
      (await childrenOf(extensionWorker, folder.folderId)).map((item) => [item.title, item.url]),
    )
    .toEqual(original.map((item) => [item.title, item.url]));
});

test('cancelling the review leaves every bookmark unchanged', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedBrokenLinks(extensionWorker, 'E2E Repair Cancel');
  const original = await childrenOf(extensionWorker, folder.folderId);
  const review = await openRepairReview(page, extensionId, folder.folderId);

  await choose(page, 'Missing', 'Delete bookmark');
  await choose(page, 'Moved', 'Use redirect target');
  await review.getByRole('button', { name: 'Cancel' }).click();
  await expect(review).toHaveCount(0);

  // Reopening starts from Keep again, and Escape also discards the plan.
  await toolCard(page, 'Check Dead Links').getByRole('button', { name: 'Scan' }).click();
  await page
    .getByRole('dialog', { name: 'Check Dead Links' })
    .getByRole('button', { name: 'Review repairs' })
    .click();
  await expect(review.getByTestId('dead-link-repair-summary')).toHaveText(
    'Delete: 0. Replace URL: 0. Keep: 5.',
  );
  await choose(page, 'Refused', 'Delete bookmark');
  await page.keyboard.press('Escape');
  await expect(review).toHaveCount(0);

  expect(await childrenOf(extensionWorker, folder.folderId)).toEqual(original);
});

test('repairs skip bookmarks changed after the scan and report them', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedBrokenLinks(extensionWorker, 'E2E Repair Stale');
  const review = await openRepairReview(page, extensionId, folder.folderId);

  await choose(page, 'Missing', 'Delete bookmark');
  await choose(page, 'Moved', 'Use redirect target');
  await choose(page, 'Refused', 'Delete bookmark');
  // Changes made elsewhere after the scan: one URL fixed by the user, one bookmark deleted.
  await extensionWorker.evaluate(
    async ({ editId, removeId }) => {
      await chrome.bookmarks.update(editId, { url: 'https://e2e.invalid/fixed-by-user' });
      await chrome.bookmarks.remove(removeId);
    },
    { editId: folder.ids.Missing, removeId: folder.ids.Moved },
  );
  await review.getByRole('button', { name: 'Apply 3 changes' }).click();

  await expect(
    toastRegion(page).getByText('Some repairs were not applied', { exact: true }),
  ).toBeVisible();
  const outcome = review.getByTestId('dead-link-repair-result');
  await expect(outcome).toContainText(
    'Deleted: 1. URLs replaced: 0. Skipped because they changed after the scan: 2. Failed: 0.',
  );
  await expect(outcome).toContainText('Missing: changed after the scan; left untouched');
  await expect(outcome).toContainText('Moved: changed after the scan; left untouched');
  await expect
    .poll(async () =>
      (await childrenOf(extensionWorker, folder.folderId)).map((item) => [item.title, item.url]),
    )
    .toEqual([
      ['Plain', `${site.origin}/plain`],
      ['Missing', 'https://e2e.invalid/fixed-by-user'],
      ['Renamed Page', `${site.origin}/old-page`],
      ['Private', `${site.origin}/private`],
    ]);

  // The dialog's undo restores only what this batch changed.
  await review.getByRole('button', { name: 'Undo' }).click();
  await expect(review).toHaveCount(0);
  await expect
    .poll(async () =>
      (await childrenOf(extensionWorker, folder.folderId)).map((item) => [item.title, item.url]),
    )
    .toEqual([
      ['Plain', `${site.origin}/plain`],
      ['Missing', 'https://e2e.invalid/fixed-by-user'],
      ['Refused', folder.refused],
      ['Renamed Page', `${site.origin}/old-page`],
      ['Private', `${site.origin}/private`],
    ]);
});
