// Example step: seed synthetic bookmarks, then screenshot each extension page.
// Copy into <QA_DIR>/<RUN>/. The type-only import is erased at runtime, so its path only
// matters for editor type checking.
import type { Ctx } from './explore-run';

export default async ({ sw, open, shot, log }: Ctx) => {
  await sw.evaluate(async () => {
    const make = (details: chrome.bookmarks.CreateDetails) => chrome.bookmarks.create(details);
    const dev = await make({ parentId: '1', title: 'Dev' });
    await make({ parentId: dev.id, title: 'GitHub', url: 'https://github.com/' });
    await make({
      parentId: dev.id,
      title: 'A very long title to check truncation behaviour in narrow views and tables',
      url: 'https://example.com/docs/very/long/path?utm_source=test&utm_medium=x',
    });
    const news = await make({ parentId: '1', title: 'News' });
    await make({ parentId: news.id, title: 'Hacker News', url: 'https://news.ycombinator.com/' });
    await make({ parentId: news.id, title: 'Hacker News (dup)', url: 'https://news.ycombinator.com/' });
    await make({ parentId: '1', title: '日本語のブックマーク', url: 'https://www.nhk.or.jp/' });
    await make({ parentId: '1', title: '<i>html</i><img src=x> title', url: 'https://example.org/' });
  });

  const count = await sw.evaluate(async () => (await chrome.bookmarks.search({})).length);
  log(`[seeded bookmarks] ${count}`);

  const pages = [
    ['popup.html', 420, 600],
    ['sidepanel.html', 400, 900],
    ['options.html', 1200, 900],
  ] as const;
  for (const [pagePath, width, height] of pages) {
    const page = await open(pagePath, width, height);
    await shot(page, `01-${pagePath.replace('.html', '')}`);
    await page.close();
  }
};
