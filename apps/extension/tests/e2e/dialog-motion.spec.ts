import { expect, test } from './fixtures';

test('a closing dialog fades its backdrop out without flashing back', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await extensionWorker.evaluate(() =>
    chrome.storage.sync.set({ 'bookmark-scout-settings': { language: 'en', aiEnabled: true } }),
  );
  // The suite runs with reduced motion; this test needs the real exit animation.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'AI', exact: true }).click();
  await page.getByRole('button', { name: 'Add service' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(400);

  // Sample the backdrop's opacity every frame from the close until it is removed.
  const samples = await page.evaluate(async () => {
    const backdrop = document.querySelector<HTMLElement>('.bg-black\\/80');
    const cancel = [...document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')].find(
      (button) => button.textContent?.trim() === 'Cancel',
    );
    if (!backdrop || !cancel) throw new Error('Dialog backdrop or Cancel button not found');
    const opacities: number[] = [];
    cancel.click();
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (!backdrop.isConnected || performance.now() - start > 1000) return resolve();
        opacities.push(Number(getComputedStyle(backdrop).opacity));
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return { opacities, removed: !backdrop.isConnected };
  });

  expect(samples.removed).toBe(true);
  // Once fading, the backdrop never becomes more opaque again.
  for (let index = 1; index < samples.opacities.length; index += 1) {
    expect(samples.opacities[index]).toBeLessThanOrEqual(samples.opacities[index - 1] + 0.01);
  }
});
