import { expect, test } from '../e2e/fixtures';
import {
  closeMeasured,
  libraryNames,
  measureInteraction,
  measureScroll,
  openMeasured,
  PerfReport,
  perfConfig,
  seedLibrary,
} from './harness';

// The harness opens the popup as a tab, which gets no activeTab; saving reads the current tab.
test.use({ grantPermissions: ['tabs'] });

const POPUP = { width: 400, height: 600 };
const SAVED_URL = 'https://www.example.com/perf/saved-page';

// The popup's "current tab" would be itself; report a sample page instead.
const stubActiveTab = (url: string) => {
  const original = chrome.tabs.query.bind(chrome.tabs);
  // @ts-expect-error measurement-only override
  chrome.tabs.query = async (query: chrome.tabs.QueryInfo) =>
    query?.active
      ? [
          {
            id: 999,
            index: 0,
            windowId: 1,
            active: true,
            highlighted: true,
            pinned: false,
            incognito: false,
            title: 'Perf saved page',
            url,
          },
        ]
      : original(query);
};

test('popup: open, search, save to a folder by name', async ({
  context,
  extensionId,
  extensionWorker,
}, testInfo) => {
  const created = await seedLibrary(extensionWorker);
  testInfo.annotations.push({ type: 'library', description: `${created} bookmarks and folders` });
  const report = new PerfReport();
  const { areas } = perfConfig.library;
  // A topic in the middle of the library, typed as "<area>-<topic>".
  const area = Math.floor(areas / 2);
  const query = `${area}-3`;
  const target = libraryNames.topic(area, 3);

  for (let run = 0; run < perfConfig.run.repeats; run++) {
    const { page, firstSeen } = await openMeasured(
      context,
      `chrome-extension://${extensionId}/popup.html`,
      ['.folder-item'],
      { size: POPUP, setup: (popup) => popup.addInitScript(stubActiveTab, SAVED_URL) },
    );
    report.add('popup.open', firstSeen['.folder-item']);

    // Each step needs the page the previous one left; a step that times out ends the run.
    const steps = async () => {
      const search = page.getByPlaceholder(/Search bookmarks/);
      await search.click();
      const typed = await measureInteraction(
        page,
        () => search.pressSequentially(query, { delay: 60 }),
        { selector: '[data-slot="folder-match"]', text: target },
      );
      if (!report.addInteraction('popup.search.results', typed, 'popup.search.keystroke')) return;

      const saved = await measureInteraction(
        page,
        async () => {
          await search.press('ArrowDown');
          await page.keyboard.press('Enter');
        },
        { text: 'Bookmark Added' },
      );
      if (!report.addInteraction('popup.save', saved)) return;
      // Keep the library the same for the next run.
      await extensionWorker.evaluate(async (url) => {
        for (const hit of await chrome.bookmarks.search({ url }))
          await chrome.bookmarks.remove(hit.id);
      }, SAVED_URL);
    };
    await steps();
    await closeMeasured(page);
  }

  await report.write(testInfo);
});

// Its own test, so its own browser: a frozen popup also freezes every other page of the
// extension, which share one renderer process.
test('popup: expand all and scroll', async ({
  context,
  extensionId,
  extensionWorker,
}, testInfo) => {
  // A frozen renderer can be neither crashed nor closed from here, so the browser only closes
  // when the test times out. Keep that short: one action timeout and the setup around it.
  test.setTimeout(4 * 60_000);
  await seedLibrary(extensionWorker);
  const report = new PerfReport();

  for (let run = 0; run < perfConfig.run.repeats; run++) {
    // From a freshly opened popup, as a user would.
    const { page } = await openMeasured(
      context,
      `chrome-extension://${extensionId}/popup.html`,
      ['.folder-item'],
      { size: POPUP },
    );
    const expanded = await measureInteraction(
      page,
      // The bookmarks bar's own button expands every folder under it.
      () =>
        page.getByRole('button', { name: 'Expand all subfolders', exact: true }).first().click(),
      // The bar's button turns into "Collapse all subfolders" once every folder is open. The
      // tree renders only the rows on screen, so counting rows would never reach the library.
      { selector: 'button[aria-label="Collapse all subfolders"]' },
    );
    // A frozen popup cannot be measured again in this browser.
    if (!report.addInteraction('popup.expandAll', expanded)) {
      // Crashing the frozen page lets the browser close at the end of the test.
      await closeMeasured(page);
      break;
    }

    const scrolled = await measureScroll(page);
    expect(scrolled.distance, 'the expanded tree scrolls').toBeGreaterThan(0);
    report.add('popup.scroll.longFrames', scrolled.longFrames, 'frames');
    report.add('popup.scroll.worstFrame', scrolled.worstFrame);
    report.add('popup.scroll.p95Frame', scrolled.p95Frame);
    await closeMeasured(page);
  }

  await report.write(testInfo);
});
