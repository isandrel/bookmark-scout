import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from './fixtures';
import { childrenOf, openTools, seedFolder, setSettings, toolCard } from './tool-helpers';

// "日本語" encoded as Shift_JIS.
const SHIFT_JIS_TITLE = Buffer.from([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea]);

type LocalSite = { origin: string; requests: string[]; close: () => Promise<void> };

/** A real HTTP server that never sends CORS headers, so only host access lets requests through. */
async function startLocalSite(): Promise<LocalSite> {
  const requests: string[] = [];
  const html = (res: ServerResponse, status: number, body: string | Buffer, type = 'text/html') => {
    res.writeHead(status, { 'content-type': type });
    res.end(body);
  };
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    requests.push(`${req.method} ${pathname}`);
    switch (pathname) {
      case '/plain':
        return html(
          res,
          200,
          '<title>Plain Page Title</title><meta name="description" content="Plain">',
        );
      case '/other':
        return html(res, 200, '<title>Other Page Title</title>');
      case '/missing':
        return html(res, 404, '<title>404 Not Found</title>');
      case '/head-405':
        if (req.method === 'HEAD') return html(res, 405, '');
        return html(res, 200, '<title>GET only</title>');
      case '/loop':
        res.writeHead(302, { location: '/loop' });
        return res.end();
      case '/head-403':
        if (req.method === 'HEAD') return html(res, 403, '');
        return html(res, 200, '<title>GET only</title>');
      case '/redirect':
        res.writeHead(302, { location: '/plain' });
        return res.end();
      case '/stall':
        // Headers and part of the head arrive, then the body never finishes.
        res.writeHead(200, { 'content-type': 'text/html' });
        res.write('<html><head><title>Never finished');
        return;
      case '/file.pdf':
        res.writeHead(200, { 'content-type': 'application/pdf' });
        res.write('%PDF-1.7\n');
        // Never ends: a download of the whole file would hang the scan.
        return;
      case '/sjis':
        return html(
          res,
          200,
          Buffer.concat([Buffer.from('<title>'), SHIFT_JIS_TITLE, Buffer.from('</title>')]),
          'text/html; charset=Shift_JIS',
        );
      default:
        return html(res, 500, '<title>Internal Server Error</title>');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    // The browser keeps connections alive; drop them so close() cannot hang the hook.
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

let site: LocalSite;
test.beforeEach(async () => {
  site = await startLocalSite();
});
test.afterEach(async () => {
  await site.close();
});

test.describe('with website access granted', () => {
  test.use({ grantWebHostAccess: true });

  test('dead-link checker reaches a real non-CORS server, falls back to GET, reports redirects, and skips bookmarklets', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const folder = await seedFolder(extensionWorker, 'E2E Real Links', [
      { title: 'Plain', url: `${site.origin}/plain` },
      { title: 'Missing', url: `${site.origin}/missing` },
      { title: 'Head Rejected', url: `${site.origin}/head-405` },
      { title: 'Head Forbidden', url: `${site.origin}/head-403` },
      { title: 'Moved', url: `${site.origin}/redirect` },
      { title: 'Loop', url: `${site.origin}/loop` },
      { title: 'Refused', url: 'http://127.0.0.1:9/closed' },
      { title: 'Bookmarklet', url: 'javascript:void(0)' },
    ]);
    await setSettings(extensionWorker, {
      deadLinksRetryCount: 0,
      deadLinksFollowRedirects: false,
      deadLinksDefaultScope: 'folder',
    });

    await openTools(page, extensionId, folder.folderId);
    await toolCard(page, 'Check Dead Links').getByRole('button', { name: 'Scan' }).click();
    const results = page.getByRole('dialog', { name: 'Check Dead Links' });
    const row = (title: string) =>
      results.locator('div.rounded-lg').filter({ has: page.getByText(title, { exact: true }) });
    await expect(row('Plain')).toContainText('Reachable');
    await expect(row('Missing')).toContainText('HTTP 404');
    await expect(row('Head Rejected')).toContainText('Reachable');
    await expect(row('Head Forbidden')).toContainText('Reachable');
    await expect(row('Loop')).toContainText(
      'Too many redirects (or the redirect target could not be reached)',
    );
    await expect(row('Refused')).toContainText('Could not connect to the site');
    await expect(row('Moved')).toContainText(`Redirects to ${site.origin}/plain`);
    await expect(row('Moved')).not.toContainText('HTTP 0');
    await expect(row('Bookmarklet')).toContainText('Not a web link; skipped');
    await expect(results).not.toContainText('Failed to fetch');

    expect(site.requests).toEqual(
      expect.arrayContaining([
        'HEAD /plain',
        'HEAD /missing',
        'GET /missing',
        'HEAD /head-405',
        'GET /head-405',
        'HEAD /head-403',
        'GET /head-403',
      ]),
    );
    // A successful HEAD is never repeated as a GET.
    expect(site.requests).not.toContain('GET /plain');
    expect(await childrenOf(extensionWorker, folder.folderId)).toHaveLength(8);
  });

  test('metadata fetcher decodes Shift_JIS, ignores error pages, and applies only reviewed titles', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const folder = await seedFolder(extensionWorker, 'E2E Real Metadata', [
      { title: 'Plain Original', url: `${site.origin}/plain` },
      { title: 'Other Original', url: `${site.origin}/other` },
      { title: 'Missing Original', url: `${site.origin}/missing` },
      { title: 'Broken Original', url: `${site.origin}/broken` },
      { title: 'Japanese Original', url: `${site.origin}/sjis` },
      { title: 'Bookmarklet', url: 'javascript:alert(1)' },
    ]);
    await setSettings(extensionWorker, {
      metadataFetcherOverwriteTitles: true,
      metadataFetcherDefaultScope: 'folder',
    });

    await openTools(page, extensionId, folder.folderId);
    await toolCard(page, 'Metadata Fetcher').getByRole('button', { name: 'Scan' }).click();
    const results = page.getByRole('dialog', { name: 'Metadata Fetcher' });
    await expect(results).toContainText('Suggested title: Plain Page Title');
    await expect(results).toContainText('Suggested title: 日本語');
    await expect(results).toContainText('HTTP 404');
    await expect(results).toContainText('HTTP 500');
    await expect(results).not.toContainText('404 Not Found');
    await expect(results).not.toContainText('Internal Server Error');
    await expect(results).toContainText('Not a web link; skipped');
    expect(site.requests).not.toContain('GET /javascript');

    await results
      .getByRole('checkbox', { name: 'Apply suggested title for Other Original' })
      .click();
    await results.getByRole('button', { name: 'Apply 2 titles' }).click();
    await expect(page.getByText('Titles updated', { exact: true })).toBeVisible();
    await expect
      .poll(async () =>
        (await childrenOf(extensionWorker, folder.folderId)).map((item) => item.title),
      )
      .toEqual([
        'Plain Page Title',
        'Other Original',
        'Missing Original',
        'Broken Original',
        '日本語',
        'Bookmarklet',
      ]);
  });

  test('metadata fetcher times out on a stalled body, skips non-HTML files, and leaves Running', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const folder = await seedFolder(extensionWorker, 'E2E Stalled Metadata', [
      { title: 'Stalled', url: `${site.origin}/stall` },
      { title: 'Document', url: `${site.origin}/file.pdf` },
      { title: 'Plain Original', url: `${site.origin}/plain` },
    ]);
    await setSettings(extensionWorker, {
      metadataFetcherOverwriteTitles: true,
      metadataFetcherRequestTimeoutMs: 1000,
      metadataFetcherDefaultScope: 'folder',
    });

    await openTools(page, extensionId, folder.folderId);
    const card = toolCard(page, 'Metadata Fetcher');
    await card.getByRole('button', { name: 'Scan' }).click();
    const results = page.getByRole('dialog', { name: 'Metadata Fetcher' });
    const row = (title: string) =>
      results.locator('div.rounded-lg').filter({ has: page.getByText(title, { exact: true }) });
    await expect(row('Stalled')).toContainText('Request timed out', { timeout: 10_000 });
    await expect(row('Document')).toContainText('Not an HTML page; skipped');
    await expect(row('Plain Original')).toContainText('Suggested title: Plain Page Title');
    await page.keyboard.press('Escape');
    await expect(card.getByRole('button', { name: 'Scan' })).toBeEnabled();
    await expect(card).not.toContainText('Running...');
  });

  test('metadata apply skips bookmarks renamed after the scan', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const folder = await seedFolder(extensionWorker, 'E2E Stale Metadata', [
      { title: 'Plain Original', url: `${site.origin}/plain` },
    ]);
    await setSettings(extensionWorker, { metadataFetcherOverwriteTitles: true });

    await openTools(page, extensionId, folder.folderId);
    await toolCard(page, 'Metadata Fetcher').getByRole('button', { name: 'Scan' }).click();
    const results = page.getByRole('dialog', { name: 'Metadata Fetcher' });
    await expect(results).toContainText('Suggested title: Plain Page Title');
    await extensionWorker.evaluate(async (id) => {
      await chrome.bookmarks.update(id, { title: 'Renamed By User' });
    }, folder.ids['Plain Original']);
    await results.getByRole('button', { name: 'Apply 1 title' }).click();
    await expect(page.getByText('Some titles were not updated', { exact: true })).toBeVisible();
    expect((await childrenOf(extensionWorker, folder.folderId))[0].title).toBe('Renamed By User');
  });
});

test('network tools explain and request website access, and scan nothing when it is declined', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Access Prompt', [
    { title: 'Plain', url: `${site.origin}/plain` },
  ]);
  // The real browser prompt cannot be answered headlessly; simulate the user declining it.
  await page.addInitScript(() => {
    Object.defineProperty(chrome.permissions, 'request', {
      configurable: true,
      value: () => Promise.resolve(false),
    });
  });

  await openTools(page, extensionId, folder.folderId);
  await toolCard(page, 'Check Dead Links').getByRole('button', { name: 'Scan' }).click();
  const prompt = page.getByRole('dialog', { name: 'Allow access to websites?' });
  await expect(prompt).toContainText('Most sites block these requests');
  await prompt.getByRole('button', { name: 'Not now' }).click();
  await expect(prompt).toHaveCount(0);

  await toolCard(page, 'Metadata Fetcher').getByRole('button', { name: 'Scan' }).click();
  await prompt.getByRole('button', { name: 'Allow access' }).click();
  await expect(page.getByText('Website access not granted', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Metadata Fetcher' })).toHaveCount(0);
  expect(site.requests).toEqual([]);
});
