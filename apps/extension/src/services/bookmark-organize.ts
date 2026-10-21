/**
 * The bookmark manager's organizing commands, after Chrome's manager: sort a folder by name, add
 * a bookmark or folder, and cut, copy, and paste. Every change records one undo history entry
 * (`recordBookmarkWrites`).
 *
 * Cut and copy remember the items' ids in session storage, so every manager tab, and the page
 * after a reload, can paste them, and put their URLs on the system clipboard (plain text, one per
 * line, and HTML links), so they paste into other apps too. Paste moves cut items (they stay where
 * they are until then, unlike Chrome, which removes them at once), or creates copies of copied
 * items as they are at that moment; items deleted since are skipped. When the system clipboard
 * holds other text, paste creates a bookmark for each URL in it.
 *
 * No React here.
 */
import { z } from 'zod';

export type BookmarkFolderChild = { id: string; title: string; url?: string; index?: number };

/**
 * The order "Sort by name" gives a folder's children, as Chrome's `sortChildren` does: folders
 * first, then by title (natural order, as the Alphabetical sort setting).
 */
export function sortedFolderOrder(children: readonly BookmarkFolderChild[]): string[] {
  return sortBookmarkItems(
    children,
    'alphabetical',
    {
      getTitle: (child) => child.title,
      getDateAdded: () => undefined,
      isFolder: (child) => child.url === undefined,
      getIndex: (child) => child.index,
    },
    { groupFolders: true },
  ).map((child) => child.id);
}

/** Sorts `folderId`'s children by name, by moving them; one undo entry. False when in order. */
export async function sortBookmarkFolder(folderId: string, folderTitle: string): Promise<boolean> {
  const children = await getBookmarkChildren(folderId);
  const order = sortedFolderOrder(children);
  if (order.every((id, index) => children[index]?.id === id)) return false;
  await recordBookmarkWrites({ action: 'sort', title: folderTitle }, async (writer) => {
    // Each item moves up to its place; everything after it is still unsorted.
    for (const [index, id] of order.entries()) {
      const current = await getBookmarkChildren(folderId);
      if (current[index]?.id === id) continue;
      await writer.move(id, { parentId: folderId, index });
    }
  });
  return true;
}

/** Adds a bookmark (with `url`) or a folder at the end of `parentId`; one undo entry. */
export async function addBookmarkItem(details: {
  parentId: string;
  title: string;
  url?: string;
}): Promise<Browser.bookmarks.BookmarkTreeNode> {
  const { result } = await recordBookmarkWrites({ action: 'add', title: details.title }, (writer) =>
    writer.create(details),
  );
  return result;
}

/**
 * Moves `ids`, in order, into `destination.parentId` before `destination.beforeId` (the end when
 * null): a drag and drop. One undo entry. Resolves to how many moved.
 */
export async function moveBookmarksTo(
  ids: readonly string[],
  destination: ManagerDropDestination,
): Promise<number> {
  let moved = 0;
  await recordBookmarkWrites({ action: 'move', count: ids.length }, async (writer) => {
    for (const id of ids) {
      await writer.moveBefore(id, destination.parentId, destination.beforeId);
      moved += 1;
    }
  });
  return moved;
}

/** Creates a bookmark for each link dropped from another page or app; one undo entry. */
export async function addDroppedLinks(
  links: readonly { url: string; title: string }[],
  destination: ManagerDropDestination,
): Promise<number> {
  await recordBookmarkWrites({ action: 'add', count: links.length }, async (writer) => {
    for (const link of links) {
      const siblings = await getBookmarkChildren(destination.parentId);
      const before = destination.beforeId
        ? siblings.findIndex((sibling) => sibling.id === destination.beforeId)
        : -1;
      await writer.create({
        parentId: destination.parentId,
        ...(before >= 0 ? { index: before } : {}),
        title: link.title,
        url: link.url,
      });
    }
  });
  return links.length;
}

const clipboardConfig = readConfig(
  'bookmarks/clipboard',
  z.strictObject({ max_items: z.number().int().positive() }),
);

/**
 * What Cut or Copy holds for Paste: the items' ids, whether they were cut, and a hash of the text
 * the system clipboard got (to tell this page's text from another app's), with the time.
 */
export type BookmarkClipboard = {
  mode: 'cut' | 'copy';
  ids: string[];
  textHash: string;
  at: number;
};

/** Shared by every manager tab until the browser closes (`STORAGE_ITEMS.bookmarkClipboard`). */
export const bookmarkClipboardValue = defineStoredValue<BookmarkClipboard | null>(
  STORAGE_ITEMS.bookmarkClipboard,
  {
    schema: z
      .object({
        mode: z.enum(['cut', 'copy']),
        ids: z.array(z.string().min(1)).min(1).max(clipboardConfig.max_items),
        textHash: z.string(),
        at: z.number().int().nonnegative(),
      })
      .nullable(),
    empty: null,
    isEmpty: (value) => value === null,
  },
);

/** FNV-1a: a short, stable fingerprint of the clipboard text, so the text itself is not kept. */
function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(HEX_RADIX);
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );

/** What the system clipboard gets for `nodes`: their URLs, else their titles. */
export function bookmarkClipboardData(nodes: readonly { title: string; url?: string }[]): {
  text: string;
  html: string;
} {
  const links = nodes.filter((node) => node.url);
  if (links.length === 0) {
    const text = nodes.map((node) => node.title).join('\n');
    return { text, html: nodes.map((node) => escapeHtml(node.title)).join('<br>') };
  }
  return {
    text: links.map((node) => node.url).join('\n'),
    html: links
      .map(
        (node) =>
          `<a href="${escapeHtml(node.url ?? '')}">${escapeHtml(node.title || (node.url ?? ''))}</a>`,
      )
      .join('<br>'),
  };
}

/** Writes text and HTML to the system clipboard; plain text where HTML is not supported. */
async function writeSystemClipboard({ text, html }: { text: string; html: string }) {
  if (typeof ClipboardItem === 'function' && navigator.clipboard.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ]);
      return;
    } catch {
      // Fall through to plain text.
    }
  }
  await navigator.clipboard.writeText(text);
}

// The Cut or Copy this page is still storing, if any.
let pendingClipboardWrite: Promise<unknown> = Promise.resolve();

/** Thrown when one Cut or Copy names more items than `max_items`. */
export class BookmarkClipboardLimitError extends Error {
  constructor(readonly limit: number) {
    super(t('error_clipboardTooManyItems', String(limit)));
    this.name = 'BookmarkClipboardLimitError';
  }
}

/**
 * Remembers `ids` for Paste in every manager tab (moving them, or copying them as they are when
 * pasted) and returns what the system clipboard should get. `toSystem` writes it there too (a
 * menu command); a copy or cut event writes it into the event instead and passes that text as
 * `systemText`, so Paste knows it from text another app copies later.
 */
export function setBookmarkClipboard(
  mode: 'cut' | 'copy',
  ids: readonly string[],
  options: { toSystem?: boolean; systemText?: string } = {},
): Promise<{ text: string; html: string }> {
  const write = storeBookmarkClipboard(mode, ids, options);
  // A paste right after (Ctrl+C, then Ctrl+V) waits for this write instead of reading the old one.
  pendingClipboardWrite = write.catch(() => undefined);
  return write;
}

async function storeBookmarkClipboard(
  mode: 'cut' | 'copy',
  ids: readonly string[],
  { toSystem = false, systemText }: { toSystem?: boolean; systemText?: string },
): Promise<{ text: string; html: string }> {
  if (ids.length > clipboardConfig.max_items) {
    throw new BookmarkClipboardLimitError(clipboardConfig.max_items);
  }
  const nodes = (await Promise.all(ids.map((id) => captureBookmarkSubtree(id).catch(() => null))))
    .filter((snapshot) => snapshot !== null)
    .map((snapshot) => snapshot.node);
  const data = bookmarkClipboardData(nodes);
  const textHash = hashText(systemText ?? data.text);
  await bookmarkClipboardValue.set(
    ids.length > 0 ? { mode, ids: [...ids], textHash, at: Date.now() } : null,
  );
  if (toSystem) await writeSystemClipboard(data);
  return data;
}

/**
 * Creates a copy of `node` with everything inside it: titles, addresses, empty folders, Firefox
 * separators (only Firefox has them, so only Firefox copies them), and tags and summaries under
 * the copies' new ids. Browser-managed fields (ids, dates) are the browser's own for the copies.
 */
async function createCopy(
  writer: BookmarkWriter,
  node: RecoverableBookmarkNode,
  parentId: string,
  index?: number,
): Promise<number> {
  const created = await writer.create({
    parentId,
    ...(index === undefined ? {} : { index }),
    title: node.title,
    ...(node.url ? { url: node.url } : {}),
    ...(node.type ? { type: node.type } : {}),
    ...(node.metadata ? { metadata: node.metadata } : {}),
  });
  let count = 1;
  for (const child of node.children ?? []) count += await createCopy(writer, child, created.id);
  return count;
}

export type BookmarkPasteResult = { pasted: number; skipped: number };

/**
 * Pastes into `parentId` at `index` (the end when absent): the items Cut or Copy holds (from this
 * manager tab or another), or, when `systemText` holds something else (another app copied since),
 * a bookmark for each URL in it. Items deleted since are skipped, and so is a folder pasted into
 * itself. Cut items paste once: those that moved leave the clipboard, and those that could not
 * move but still exist stay there to paste somewhere else. One undo entry. Null when there was
 * nothing to paste.
 */
export async function pasteBookmarks(
  target: { parentId: string; index?: number },
  systemText?: string,
): Promise<BookmarkPasteResult | null> {
  await pendingClipboardWrite;
  const content = await bookmarkClipboardValue.get();
  const fromSystem =
    systemText !== undefined &&
    systemText.trim() !== '' &&
    hashText(systemText) !== content?.textHash;
  if (fromSystem) {
    const urls = urlsInText(systemText);
    if (urls.length === 0) return null;
    await recordBookmarkWrites({ action: 'add', count: urls.length }, async (writer) => {
      for (const [offset, url] of urls.entries()) {
        await writer.create({
          parentId: target.parentId,
          ...(target.index === undefined ? {} : { index: target.index + offset }),
          title: url,
          url,
        });
      }
    });
    return { pasted: urls.length, skipped: 0 };
  }
  if (!content) return null;
  const result: BookmarkPasteResult = { pasted: 0, skipped: 0 };
  const at = (offset: number) =>
    target.index === undefined ? {} : { index: target.index + offset };
  if (content.mode === 'cut') {
    const left: string[] = [];
    try {
      await recordBookmarkWrites({ action: 'move', count: content.ids.length }, async (writer) => {
        for (const id of content.ids) {
          try {
            await writer.move(id, { parentId: target.parentId, ...at(result.pasted) });
            result.pasted += 1;
          } catch {
            // Deleted since, or a folder pasted into itself.
            result.skipped += 1;
            if (await getBookmark(id).then(Boolean, () => false)) left.push(id);
          }
        }
      });
    } finally {
      // Cut items paste once, as in Chrome; one that could not move here can still go elsewhere.
      await bookmarkClipboardValue.update((current) =>
        current?.at === content.at ? (left.length > 0 ? { ...current, ids: left } : null) : current,
      );
    }
    return result;
  }
  await recordBookmarkWrites({ action: 'add', count: content.ids.length }, async (writer) => {
    for (const id of content.ids) {
      // Copies are made from the items as they are now; one deleted since is skipped.
      const snapshot = await captureBookmarkSubtree(id).catch(() => null);
      if (!snapshot) {
        result.skipped += 1;
        continue;
      }
      await createCopy(writer, snapshot.node, target.parentId, at(result.pasted).index);
      result.pasted += 1;
    }
  });
  return result;
}
