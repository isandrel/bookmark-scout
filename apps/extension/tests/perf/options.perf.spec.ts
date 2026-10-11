import { test } from '../e2e/fixtures';
import {
  closeMeasured,
  measureInteraction,
  measureSettled,
  openMeasured,
  PerfReport,
  perfConfig,
} from './harness';

test('options: open, search settings, change a number', async ({
  context,
  extensionId,
}, testInfo) => {
  const report = new PerfReport();

  for (let run = 0; run < perfConfig.run.repeats; run++) {
    const { page, firstSeen } = await openMeasured(
      context,
      `chrome-extension://${extensionId}/options.html`,
      ['[data-setting]'],
    );
    report.add('options.open', firstSeen['[data-setting]']);

    const search = page.getByPlaceholder('Search settings...');
    const searched = await measureSettled(
      page,
      () => search.pressSequentially('timeout', { delay: 60 }),
      '#root',
    );
    if (!report.addInteraction('options.search.results', searched, 'options.search.keystroke')) {
      await closeMeasured(page);
      continue;
    }
    await search.fill('');

    await page.getByRole('tab', { name: 'AI', exact: true }).click();
    const changed = await measureInteraction(
      page,
      () => page.getByRole('button', { name: 'Increase Max Recommendations' }).click(),
      { text: 'Modified' },
    );
    if (!report.addInteraction('options.stepper', changed)) {
      await closeMeasured(page);
      continue;
    }
    // Back to the default for the next run.
    await page.getByRole('button', { name: /^Reset Max Recommendations/ }).click();
    await closeMeasured(page);
  }

  await report.write(testInfo);
});
