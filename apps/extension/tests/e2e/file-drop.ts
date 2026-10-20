import type { Locator, Page } from '@playwright/test';

/**
 * Drags a file from "the computer" onto `target`, the way the browser reports it to the page:
 * dragenter, dragover, and drop with a DataTransfer that holds the file. Playwright cannot drag
 * real files from outside the page, so the events are built in the page.
 */
export async function dropFile(
  page: Page,
  target: Locator,
  file: { name: string; mimeType: string; text: string },
): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('Drop target is not visible');
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const dataTransfer = await page.evaluateHandle(({ name, mimeType, text }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([text], name, { type: mimeType }));
    return transfer;
  }, file);
  const element = await target.elementHandle();
  if (!element) throw new Error('Drop target is gone');
  for (const type of ['dragenter', 'dragover', 'drop'] as const) {
    await element.dispatchEvent(type, { dataTransfer, clientX: point.x, clientY: point.y });
  }
}
