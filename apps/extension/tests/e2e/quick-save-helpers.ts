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
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { expect } from './fixtures';
import { readStored, removeStored, STORAGE_ITEMS } from './storage';

export type QuickSaveRecord = {
  id: string;
  mode: string;
  status: string;
  delivery: string;
  failure?: string;
  bookmarkId?: string;
  folderId?: string;
  createdFolderIds: string[];
  page: { title: string; url: string };
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

export type Recommendation = { type: 'new' | 'existing'; folderPath: string; parentPath: string };

export type QuickSaveServer = {
  origin: string;
  /**
   * The stub AI provider: the suggestions it answers with, how long it waits first, and its HTTP
   * status (400 fails at once; the AI SDK retries 5xx with backoff).
   */
  ai: { recommendations: Recommendation[]; delayMs: number; status: number; requests: number };
  close: () => Promise<void>;
};

/**
 * A local site and stub AI provider on port 0. `/<any>/<slug>` is a page titled after the slug
 * (dashes as spaces); `?css=` adds a stylesheet and `?dir=` sets `<html dir>`, to try the
 * notification on pages that style themselves in the way.
 */
export async function startQuickSaveServer(): Promise<QuickSaveServer> {
  const ai = { recommendations: [] as Recommendation[], delayMs: 0, status: 200, requests: 0 };
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors).end();
      return;
    }
    if (req.url?.startsWith('/v1/')) {
      ai.requests += 1;
      const content = JSON.stringify({
        recommendations: ai.recommendations.map((rec) => ({
          confidence: 0.9,
          reason: 'Fits',
          ...rec,
        })),
      });
      setTimeout(() => {
        if (ai.status !== 200) {
          res
            .writeHead(ai.status, { ...cors, 'content-type': 'application/json' })
            .end(JSON.stringify({ error: { message: 'Stub provider refused' } }));
          return;
        }
        res.writeHead(200, { ...cors, 'content-type': 'application/json' }).end(
          JSON.stringify({
            id: 'chat-e2e',
            object: 'chat.completion',
            created: 0,
            model: 'e2e-model',
            choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
          }),
        );
      }, ai.delayMs);
      return;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    const slug = decodeURIComponent(url.pathname.split('/').pop() || 'page');
    const title = slug.replace(/-/g, ' ');
    const css = url.searchParams.get('css') ?? '';
    const dir = url.searchParams.get('dir');
    const escapeHtml = (text: string) => text.replace(/</g, '&lt;');
    res
      .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      .end(
        `<!doctype html><html${dir ? ` dir="${escapeHtml(dir)}"` : ''}><head><title>${title}</title>` +
          `<style>${escapeHtml(css)}</style></head><body><h1>${title}</h1><p>An article.</p></body></html>`,
      );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    ai,
    // The browser keeps connections alive; drop them so close() cannot hang the hook.
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
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

export type Box = { x: number; y: number; width: number; height: number };

async function borderBox(page: Page, backendNodeId: number): Promise<Box> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { model } = (await cdp.send('DOM.getBoxModel', { backendNodeId })) as {
      model: { border: number[] };
    };
    const [x1, y1, , , x3, y3] = model.border;
    return { x: x1, y: y1, width: x3 - x1, height: y3 - y1 };
  } finally {
    await cdp.detach();
  }
}

/** Where a notification button is on screen, in CSS pixels of the viewport. */
export async function toastButtonBox(page: Page, name: string): Promise<Box> {
  const button = ((await readToast(page)) ?? []).find(
    (item) => item.role === 'button' && item.name === name,
  );
  if (!button?.backendId) throw new Error(`No "${name}" button in the notification`);
  return borderBox(page, button.backendId);
}

/** Clicks a notification button with real mouse input at its position on screen. */
export async function clickToastButton(page: Page, name: string) {
  const box = await toastButtonBox(page, name);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * The notification's box on screen, and whether the page's own hit test at its center reaches it
 * (the shadow host, as the page sees it); null when none is shown.
 */
export async function toastPlacement(
  page: Page,
): Promise<{ box: Box; hitsCenter: boolean; viewport: { width: number; height: number } } | null> {
  const cdp = await page.context().newCDPSession(page);
  let backendId: number | undefined;
  try {
    const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as { nodes: AXNode[] };
    backendId = nodes.find(
      (node) => node.role?.value === 'status' && node.name?.value === 'Bookmark Scout',
    )?.backendDOMNodeId;
  } finally {
    await cdp.detach();
  }
  if (backendId === undefined) return null;
  const box = await borderBox(page, backendId);
  const { hitsCenter, viewport } = await page.evaluate(
    ([x, y]) => ({
      hitsCenter:
        document.elementFromPoint(x, y)?.getAttribute('data-bookmark-scout') === 'quick-save',
      viewport: { width: innerWidth, height: innerHeight },
    }),
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  return { box, hitsCenter, viewport };
}

/** The color at a point of the page as painted, `[r, g, b]`. */
export async function pixelAt(page: Page, x: number, y: number): Promise<number[]> {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  return page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const image = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    context.drawImage(image, 0, 0);
    return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  }, png.toString('base64'));
}
