/**
 * Locators and gestures for the bookmark manager page, shared by specs that drive it.
 */
import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures';

/** The manager's address, showing `folderId` when given. */
export function managerUrl(extensionId: string, folderId?: string) {
  const base = `chrome-extension://${extensionId}/bookmarks.html`;
  return folderId ? `${base}?id=${folderId}` : base;
}

/** The manager's search box, which matches titles and addresses. */
export function managerSearch(page: Page) {
  return page.getByRole('textbox', { name: 'Search titles and addresses' });
}

/** The address filter behind "More filters", which this opens first when it is closed. */
export async function addressFilter(page: Page): Promise<Locator> {
  const input = page.getByPlaceholder('Filter URLs...');
  if (!(await input.isVisible())) await page.getByTestId('more-filters').click();
  await expect(input).toBeVisible();
  return input;
}

/**
 * Shows the folder in the browser's order with the toolbar button, for specs that set another
 * Sort Order first (with the default, Browser order, the table already is and the button is off).
 */
export async function showBrowserOrder(page: Page) {
  const button = page.getByRole('button', { name: 'Browser order' });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

/** The table row whose text includes `title`. */
export function managerRow(page: Page, title: string) {
  return page.locator('tbody tr').filter({ hasText: title });
}

/** A folder in the manager's folder tree, by its exact title. */
export function treeFolder(page: Page, title: string) {
  return page.getByTestId('folder-tree').getByRole('treeitem', { name: title, exact: true });
}

/** The folder the manager shows: the last breadcrumb. */
export function breadcrumbCurrent(page: Page) {
  return page.getByTestId('breadcrumb').locator('[aria-current="page"]');
}

/**
 * Shortcuts wait while a dialog or menu is in the page, and Base UI removes one a frame after it
 * closes (hidden by then, so role queries no longer see it).
 */
export async function waitForNoOverlay(page: Page) {
  await expect(page.locator('[role="dialog"], [role="menu"], [role="listbox"]')).toHaveCount(0);
}

/** Drags `source` onto `target` at `fraction` of the target's height. */
export async function dragOnto(source: Locator, target: Locator, fraction: number) {
  const box = await target.boundingBox();
  if (!box) throw new Error('Drop target is not visible');
  await source.dragTo(target, {
    sourcePosition: { x: 200, y: 10 },
    targetPosition: { x: Math.min(200, box.width / 2), y: box.height * fraction },
  });
}
