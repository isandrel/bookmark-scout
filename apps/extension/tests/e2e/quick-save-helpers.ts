/**
 * Drives quick save the way the browser does. Playwright cannot press a browser command shortcut,
 * so `pressShortcut` fires the background's real `commands.onCommand` listener from the service
 * worker with the tab the browser would pass; results are read from `chrome.bookmarks` and session
 * storage.
 *
 * The notification lives in a closed shadow root, which page scripts (and Playwright selectors)
 * cannot reach. It is read through the browser's accessibility tree and clicked with real mouse
 * input, as a user would.
 */
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { expect } from './fixtures';
import { readStored, removeStored, STORAGE_ITEMS } from './storage';

export type QuickSaveRecord = {
  id: string;
  status: string;
  delivery: string;
  bookmarkId?: string;
  folderId?: string;
  createdFolderIds: string[];
};

/**
 * Answers `url` with a small article titled `title`, so quick save has a web page to act on
 * without a server.
 */
export async function routeArticle(context: BrowserContext, url: string, title: string) {
  await context.route(url, (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><title>${title}</title><h1>${title}</h1><p>An article.</p>`,
    }),
  );
}

/** Fires the command for the tab showing `page`, as the browser does on the key press. */
export async function pressShortcut(
  worker: Worker,
  page: Page,
  command: 'quick-save' | 'ai-quick-save',
) {
  await page.bringToFront();
  const url = page.url();
  const title = await page.title();
  await removeStored(worker, STORAGE_ITEMS.quickSave);
  await worker.evaluate(
    async ({ name, tabUrl, tabTitle }) => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const event = chrome.commands.onCommand as unknown as {
        hasListeners(): boolean;
        dispatch(command: string, tab: unknown): void;
      };
      if (!event.hasListeners()) throw new Error('No command listener is registered');
      event.dispatch(name, { ...tab, url: tabUrl, title: tabTitle });
    },
    { name: command, tabUrl: url, tabTitle: title },
  );
}

/** The stored quick save once it has finished. */
export async function finishedRecord(
  worker: Worker,
  { timeout = 15_000 }: { timeout?: number } = {},
): Promise<QuickSaveRecord> {
  let record: QuickSaveRecord | undefined;
  await expect
    .poll(
      async () => {
        record = await readStored<QuickSaveRecord>(worker, STORAGE_ITEMS.quickSave);
        return record?.status;
      },
      { timeout },
    )
    .toMatch(/^(saved|duplicate|failed|removed)$/);
  return record as QuickSaveRecord;
}

export async function bookmarksWithUrl(worker: Worker, url: string) {
  return worker.evaluate(
    async (pageUrl) =>
      (await chrome.bookmarks.search({ url: pageUrl })).map(({ id, parentId, title }) => ({
        id,
        parentId,
        title,
      })),
    url,
  );
}

type AXNode = {
  nodeId: string;
  role?: { value?: string };
  name?: { value?: string };
  childIds?: string[];
  backendDOMNodeId?: number;
  ignored?: boolean;
};

type ToastItem = { role: string; name: string; backendId?: number };

/** The notification's accessibility tree: its texts and buttons, or null when none is shown. */
export async function readToast(page: Page): Promise<ToastItem[] | null> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as { nodes: AXNode[] };
    const byId = new Map(nodes.map((node) => [node.nodeId, node]));
    const root = nodes.find(
      (node) => node.role?.value === 'status' && node.name?.value === 'Bookmark Scout',
    );
    if (!root) return null;
    const items: ToastItem[] = [];
    const visit = (node: AXNode) => {
      const role = node.role?.value ?? '';
      const name = node.name?.value ?? '';
      if (!node.ignored && name && (role === 'StaticText' || role === 'button')) {
        items.push({ role, name, backendId: node.backendDOMNodeId });
      }
      for (const child of node.childIds ?? []) {
        const next = byId.get(child);
        if (next) visit(next);
      }
    };
    visit(root);
    return items;
  } finally {
    await cdp.detach();
  }
}

export async function toastTexts(page: Page): Promise<string[]> {
  return ((await readToast(page)) ?? [])
    .filter((item) => item.role === 'StaticText')
    .map((item) => item.name);
}

export async function toastButtons(page: Page): Promise<string[]> {
  return ((await readToast(page)) ?? [])
    .filter((item) => item.role === 'button')
    .map((item) => item.name);
}

/** Clicks a notification button with real mouse input at its position on screen. */
export async function clickToastButton(page: Page, name: string) {
  const button = ((await readToast(page)) ?? []).find(
    (item) => item.role === 'button' && item.name === name,
  );
  if (!button?.backendId) throw new Error(`No "${name}" button in the notification`);
  const cdp = await page.context().newCDPSession(page);
  try {
    const { model } = (await cdp.send('DOM.getBoxModel', { backendNodeId: button.backendId })) as {
      model: { content: number[] };
    };
    const [x1, y1, , , x3, y3] = model.content;
    await page.mouse.click((x1 + x3) / 2, (y1 + y3) / 2);
  } finally {
    await cdp.detach();
  }
}
