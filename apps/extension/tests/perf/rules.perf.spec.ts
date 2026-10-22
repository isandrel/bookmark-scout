/**
 * Smart Rules dry run on the full library (R17): the rules in `[rules]` of perf.toml run from the
 * Tools sidebar over every bookmark, timed from Run to the review's first row, with the rows the
 * review draws (it is virtualized, so far fewer than it lists), the heap the plan and review keep,
 * and scrolling the review. Nothing is applied.
 */
import { expect, test } from '../e2e/fixtures';
import { STORAGE_ITEMS, setSettings, writeStored } from '../e2e/storage';
import { showAllTools, toolCard } from '../e2e/tool-helpers';
import {
  closeMeasured,
  measureHeap,
  measureInteraction,
  measureScroll,
  openMeasured,
  PerfReport,
  perfConfig,
  seedLibrary,
} from './harness';

/** The version of the search query language the rules' queries are written in (search-query.ts). */
const SEARCH_SYNTAX_VERSION = 2;

test('smart rules: dry run and review on 19,500 bookmarks', async ({
  context,
  extensionId,
  extensionWorker,
}, testInfo) => {
  await seedLibrary(extensionWorker);
  const { areas, topics_per_area, pages_per_topic } = perfConfig.library;
  const bookmarks = areas * topics_per_area * pages_per_topic;
  // After the library, so Tag New Bookmarks does not tag it as it is created.
  const folderIds = await extensionWorker.evaluate(
    async (titles) =>
      Object.fromEntries(
        await Promise.all(
          titles.map(async (title) => {
            const [folder] = (await chrome.bookmarks.search({ title })).filter((node) => !node.url);
            return [title, folder?.id ?? ''];
          }),
        ),
      ),
    perfConfig.rules.list.flatMap((rule) => (rule.move_to ? [rule.move_to] : [])),
  );
  await writeStored(
    extensionWorker,
    STORAGE_ITEMS.bookmarkRules,
    perfConfig.rules.list.map((rule, index) => ({
      id: `perf-rule-${index}`,
      name: `Perf rule ${index + 1}`,
      enabled: true,
      query: rule.query,
      syntaxVersion: SEARCH_SYNTAX_VERSION,
      addTags: rule.add_tags,
      ...(rule.move_to
        ? { moveTo: { folderId: folderIds[rule.move_to], path: rule.move_to } }
        : {}),
    })),
  );
  await setSettings(extensionWorker, { bookmarkRulesDefaultScope: 'all' });
  const report = new PerfReport();

  for (let run = 0; run < perfConfig.run.repeats; run++) {
    const { page } = await openMeasured(
      context,
      `chrome-extension://${extensionId}/bookmarks.html`,
      ['tbody tr'],
    );
    await page.getByTitle('Show tools').click();
    await showAllTools(page);
    const card = toolCard(page, 'Smart Rules');
    await expect(card).toContainText(`${perfConfig.rules.list.length} rules turned on`);
    const before = await measureHeap(page);

    const reviewed = await measureInteraction(
      page,
      () => card.getByRole('button', { name: 'Run', exact: true }).click(),
      { selector: '[data-testid="rule-item"]' },
    );
    if (!report.addInteraction('rules.review', reviewed)) {
      await closeMeasured(page);
      break;
    }
    const review = page.getByRole('dialog', { name: 'Smart Rules' });
    // The first rule matches every bookmark, so the review lists the whole library.
    await expect(review.getByRole('radio').first()).toContainText(String(bookmarks));
    const rows = await review.getByTestId('rule-item').count();
    report.add('rules.reviewRows', rows, 'rows');
    expect(rows, 'the review draws only the rows near the screen').toBeLessThan(bookmarks / 100);
    report.add('rules.heapKiB', (await measureHeap(page)) - before, 'KiB');

    const scrolled = await measureScroll(page);
    expect(scrolled.distance, 'the review scrolls').toBeGreaterThan(0);
    report.add('rules.scroll.longFrames', scrolled.longFrames, 'frames');
    report.add('rules.scroll.worstFrame', scrolled.worstFrame);
    report.add('rules.scroll.p95Frame', scrolled.p95Frame);
    await closeMeasured(page);
  }

  await report.write(testInfo);
});
