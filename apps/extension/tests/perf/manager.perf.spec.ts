import { test } from '../e2e/fixtures';
import {
  closeMeasured,
  libraryNames,
  measureInteraction,
  measureSettled,
  openMeasured,
  PerfReport,
  perfConfig,
  seedLibrary,
} from './harness';

test('bookmarks manager: open, open a folder, filter, update after an outside change', async ({
  context,
  extensionId,
  extensionWorker,
}, testInfo) => {
  await seedLibrary(extensionWorker);
  const report = new PerfReport();
  const area = Math.floor(perfConfig.library.areas / 2);

  for (let run = 0; run < perfConfig.run.repeats; run++) {
    const { page, firstSeen } = await openMeasured(
      context,
      `chrome-extension://${extensionId}/bookmarks.html`,
      ['[data-testid="folder-tree"]', 'tbody tr'],
    );
    report.add('manager.open', firstSeen['tbody tr']);

    const opened = await measureInteraction(
      page,
      () =>
        page
          .getByTestId('folder-tree')
          .getByRole('treeitem', { name: libraryNames.area(area), exact: true })
          .click(),
      // Any topic of the area: the table's first page depends on the sort order.
      { selector: 'tbody tr', text: `Topic ${area}-` },
    );
    if (!report.addInteraction('manager.openFolder', opened)) {
      await closeMeasured(page);
      continue;
    }

    const filter = page.getByPlaceholder('Search titles and addresses');
    const filtered = await measureSettled(
      page,
      () => filter.pressSequentially(`${area}-7`, { delay: 60 }),
      'main',
    );
    if (!report.addInteraction('manager.filter.results', filtered, 'manager.filter.keystroke')) {
      await closeMeasured(page);
      continue;
    }
    await filter.fill('');

    // A bookmark added elsewhere (another window, sync) shows up without a reload.
    const title = `${libraryNames.topic(area, 0)} outside change ${run}`;
    const updated = await measureInteraction(
      page,
      async () => {
        await page.evaluate(() =>
          (window as unknown as { __bsPerf: { inputs: number[] } }).__bsPerf.inputs.push(
            performance.now(),
          ),
        );
        await extensionWorker.evaluate(
          async ({ areaTitle, bookmarkTitle }) => {
            const [folder] = (await chrome.bookmarks.search({ title: areaTitle })).filter(
              (node) => !node.url,
            );
            await chrome.bookmarks.create({
              parentId: folder.id,
              index: 0,
              title: bookmarkTitle,
              url: 'https://example.com/outside',
            });
          },
          { areaTitle: libraryNames.area(area), bookmarkTitle: title },
        );
      },
      { selector: 'tbody tr', text: title },
    );
    report.addInteraction('manager.outsideChange', updated);
    await closeMeasured(page);
  }

  await report.write(testInfo);
});
