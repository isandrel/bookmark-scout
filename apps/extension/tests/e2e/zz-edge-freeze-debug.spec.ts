// TEMPORARY diagnostic for the Edge-only options freeze (PR #600). Removed once understood.
import { expect, test } from './fixtures';

test('edge freeze diagnostic: heartbeat and mutations after a change in the reorganization fold', async ({
  extensionId,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'edge', 'Edge only');
  test.setTimeout(90_000);
  const lines: string[] = [];
  page.on('console', (message) => {
    if (message.text().startsWith('[diag]')) lines.push(message.text());
  });
  page.on('pageerror', (error) => lines.push(`[pageerror] ${error.message}`));
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'AI Tools', exact: true }).click();
  await page.locator('[data-settings-section="reorganization"] [data-slot="settings-advanced"] > button').click();
  await page.evaluate(() => {
    let mutations = 0;
    const targets = new Map<string, number>();
    new MutationObserver((records) => {
      mutations += records.length;
      for (const record of records) {
        const el = record.target instanceof Element ? record.target : record.target.parentElement;
        const key = `${record.type}:${record.attributeName ?? ''}:${el?.closest('[data-setting],[data-setting-group],[data-slot]')?.getAttribute('data-setting') ?? el?.closest('[data-setting-group]')?.getAttribute('data-setting-group') ?? el?.tagName}`;
        targets.set(key, (targets.get(key) ?? 0) + 1);
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    let beat = 0;
    setInterval(() => {
      const top = [...targets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
      console.log(`[diag] beat ${beat++} mutations ${mutations} top ${JSON.stringify(top)}`);
      mutations = 0;
      targets.clear();
    }, 1000);
  });
  await page.waitForTimeout(2000);
  lines.push('[test] increasing Max Categories');
  await page.getByRole('button', { name: 'Increase Max Categories' }).click();
  await page.waitForTimeout(4000);
  lines.push('[test] clicking AI tab');
  const clicked = await page
    .getByRole('tab', { name: 'AI', exact: true })
    .click({ timeout: 8000 })
    .then(() => 'clicked')
    .catch((error: Error) => `click failed: ${error.message.split('\n')[0]}`);
  lines.push(`[test] ${clicked}`);
  await page.waitForTimeout(3000);
  console.log(`EDGE-DIAG\n${lines.join('\n')}\nEDGE-DIAG-END`);
  expect(true).toBe(true);
});
