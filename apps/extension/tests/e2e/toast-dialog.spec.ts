/**
 * Toasts over an open dialog: the stack keeps clear of the dialog's footer buttons at every Toast
 * Position (src/lib/toast-dialog-clearance.ts), stays on screen and announced, and the buttons
 * take a normal click.
 */
import type { Locator, Page } from '@playwright/test';
import type { ToastPosition } from '../../src/lib/settings-schema';
import { openBackupDialog, openRestore, saveBackup } from './backup-helpers';
import { expect, test, toastRegion } from './fixtures';
import { setSettings } from './storage';

// Every Toast Position; the schema is not importable here, so typecheck fails when one is added.
const POSITIONS = Object.keys({
  'bottom-right': true,
  'bottom-left': true,
  'bottom-center': true,
  'top-right': true,
  'top-left': true,
  'top-center': true,
} satisfies Record<ToastPosition, true>) as ToastPosition[];

type Box = { x: number; y: number; width: number; height: number };

function overlaps(a: Box, b: Box) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function boxes(locator: Locator): Promise<Box[]> {
  const found: Box[] = [];
  for (const item of await locator.all()) {
    const box = await item.boundingBox();
    if (box) found.push(box);
  }
  return found;
}

/** The footer buttons a toast lies over, or whose center something else covers. */
async function coveredButtons(page: Page, buttons: Locator) {
  const toasts = await boxes(toastRegion(page).getByRole('status'));
  const covered: string[] = [];
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    const onTop = await button.evaluate((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(x + width / 2, y + height / 2));
    });
    if (!box || !onTop || toasts.some((toast) => overlaps(toast, box))) {
      covered.push((await button.textContent()) ?? '');
    }
  }
  return covered;
}

// Narrow and short enough that the restore dialog's footer sits in the toasts' corner, as in the
// report: a 672px dialog in a 900px window leaves no room beside it for a 320px toast.
test.use({ viewport: { width: 900, height: 640 } });

test('a toast shown while a dialog is open keeps clear of its footer buttons at every Toast Position', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  // The longest duration, so each toast outlasts its checks.
  await setSettings(extensionWorker, { language: 'en', toastDurationMs: 10_000 });
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  for (const position of POSITIONS) {
    await setSettings(extensionWorker, { toastPosition: position });
    await expect(toastRegion(page)).toHaveAttribute('data-position', position);
    const { raw } = await saveBackup(page, await openBackupDialog(page));
    const dialog = await openRestore(page, raw);
    await expect(dialog.getByText('Counting…')).toHaveCount(0);
    // Hovering a toast pauses it; keep the pointer off the stack and the dialog's buttons.
    await page.mouse.move(0, 0);
    const toast = toastRegion(page).getByRole('status', { name: /Backup exported/ });
    await expect(toast).toBeVisible();

    // Named rather than found through the footer, so the check does not depend on the fix.
    const buttons = dialog.getByRole('button', { name: /^(Cancel|Import \(\d+\))$/ });
    await expect(buttons).toHaveCount(2);
    await expect.poll(() => coveredButtons(page, buttons), { message: position }).toEqual([]);
    // The toast stays whole on screen, and its region is not hidden from screen readers by the
    // modal dialog.
    const box = await toastRegion(page).getByRole('status').last().boundingBox();
    expect(box?.y).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(640);
    await expect(toastRegion(page)).not.toHaveAttribute('aria-hidden', 'true');
    await expect(toastRegion(page)).not.toHaveAttribute('inert');

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
  }
});
