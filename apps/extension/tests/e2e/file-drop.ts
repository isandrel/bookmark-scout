import type { JSHandle, Locator, Page } from '@playwright/test';

/**
 * Drops `dataTransfer` onto `target` the way the browser reports a drag from outside the page:
 * dragenter, dragover, and drop. Playwright cannot drag files or links in from another app, so
 * the events are built in the page.
 */
async function dispatchDrop(target: Locator, dataTransfer: JSHandle<DataTransfer>) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('Drop target is not visible');
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const element = await target.elementHandle();
  if (!element) throw new Error('Drop target is gone');
  for (const type of ['dragenter', 'dragover', 'drop'] as const) {
    await element.dispatchEvent(type, { dataTransfer, clientX: point.x, clientY: point.y });
  }
}

/** Drags a file from "the computer" onto `target`. */
export async function dropFile(
  page: Page,
  target: Locator,
  file: { name: string; mimeType: string; text: string },
): Promise<void> {
  const dataTransfer = await page.evaluateHandle(({ name, mimeType, text }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([text], name, { type: mimeType }));
    return transfer;
  }, file);
  await dispatchDrop(target, dataTransfer);
}

/** Drags data from another app (such as a link from a web page) onto `target`, by type. */
export async function dropData(
  page: Page,
  target: Locator,
  data: Record<string, string>,
): Promise<void> {
  const dataTransfer = await page.evaluateHandle((entries) => {
    const transfer = new DataTransfer();
    for (const [type, value] of Object.entries(entries)) transfer.setData(type, value);
    return transfer;
  }, data);
  await dispatchDrop(target, dataTransfer);
}
