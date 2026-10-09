import { expect, test } from './fixtures';
import { openPopup, seedFolder, setSettings } from './popup-helpers';

test('the 300px popup with AI on fits every header button and never cuts off the placeholder', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { popupWidth: 300, aiEnabled: true });
  await openPopup(page, extensionId);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).width)).toBe('300px');
  const manager = page.getByRole('button', { name: 'Open bookmark manager', exact: true });
  await expect(manager).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Ask AI about your bookmarks or this page', exact: true }),
  ).toBeVisible();

  const fit = await page
    .getByRole('combobox', { name: 'Search bookmarks...' })
    .evaluate((input) => {
      const field = input as HTMLInputElement;
      const style = getComputedStyle(field);
      const context = document.createElement('canvas').getContext('2d');
      if (!context) throw new Error('No canvas');
      context.font = style.font;
      const px = (value: string) => Number.parseFloat(value) || 0;
      const free =
        field.getBoundingClientRect().width -
        px(style.borderLeftWidth) -
        px(style.borderRightWidth) -
        px(style.paddingLeft) -
        px(style.paddingRight);
      const buttons = [...document.querySelectorAll('button')].map(
        (button) => button.getBoundingClientRect().right,
      );
      return {
        placeholderWidth: context.measureText(field.placeholder).width,
        free,
        rightmost: Math.max(...buttons),
      };
    });
  expect(fit.placeholderWidth).toBeLessThanOrEqual(fit.free);
  expect(fit.rightmost).toBeLessThanOrEqual(300);
});

/**
 * The popup and side panel open the bookmark manager in a new tab. Firefox cannot replace its
 * bookmarks page, so there this button is the only way into the manager.
 */
for (const surface of ['popup', 'sidepanel'] as const) {
  test(`${surface} opens the bookmark manager in a new tab`, async ({
    context,
    extensionId,
    extensionWorker,
    page,
  }) => {
    await seedFolder(extensionWorker, 'E2E Manager Entry', [
      { title: 'Manager Entry Link', url: 'https://e2e.invalid/manager-entry' },
    ]);
    await page.goto(`chrome-extension://${extensionId}/${surface}.html`);

    const [manager] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Open bookmark manager', exact: true }).click(),
    ]);

    await expect(manager).toHaveURL(`chrome-extension://${extensionId}/bookmarks.html`);
    await expect(manager.getByRole('button', { name: 'Show tools' })).toBeVisible();
    await expect(manager.getByText('E2E Manager Entry').first()).toBeVisible();
  });
}
