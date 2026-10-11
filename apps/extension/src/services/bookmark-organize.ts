/**
 * The bookmark manager's organizing commands, after Chrome's manager: sort a folder by name, add
 * a bookmark or folder, and cut, copy, and paste. Every change records one undo history entry
 * (`recordBookmarkWrites`).
 *
 * Cut and copy keep the items in this page's memory and put their URLs on the system clipboard
 * (plain text, one per line, and HTML links), so they paste into other apps too. Paste moves cut
 * items (they stay where they are until then, unlike Chrome, which removes them at once), or
 * creates copies of copied items as they were when copied. When the system clipboard holds other
 * text, paste creates a bookmark for each URL in it.
 *
 * No React here.
 */

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

type ClipboardContent =
  | { mode: 'cut'; ids: string[]; text: string }
  | { mode: 'copy'; nodes: RecoverableBookmarkNode[]; text: string };

let clipboard: ClipboardContent | null = null;

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

/**
 * Remembers `ids` for Paste (moving them, or copying them as they are now) and returns what the
 * system clipboard should get. `toSystem` writes it there too (a menu command); a copy or cut
 * event writes it into the event instead.
 */
export async function setBookmarkClipboard(
  mode: 'cut' | 'copy',
  ids: readonly string[],
  { toSystem = false }: { toSystem?: boolean } = {},
): Promise<{ text: string; html: string }> {
  const nodes = (await Promise.all(ids.map((id) => captureBookmarkSubtree(id).catch(() => null))))
    .filter((snapshot) => snapshot !== null)
    .map((snapshot) => snapshot.node);
  const data = bookmarkClipboardData(nodes);
  clipboard =
    mode === 'cut' ? { mode, ids: [...ids], text: data.text } : { mode, nodes, text: data.text };
  if (toSystem) await writeSystemClipboard(data);
  return data;
}

/** Whether Paste has something of this page's to paste. */
export function hasBookmarkClipboard(): boolean {
  return clipboard !== null;
}

async function createCopy(
  writer: BookmarkWriter,
  node: RecoverableBookmarkNode,
  parentId: string,
  index?: number,
): Promise<number> {
  if (node.type === 'separator') return 0;
  const created = await writer.create({
    parentId,
    ...(index === undefined ? {} : { index }),
    title: node.title,
    ...(node.url ? { url: node.url } : {}),
  });
  let count = 1;
  for (const child of node.children ?? []) count += await createCopy(writer, child, created.id);
  return count;
}

export type BookmarkPasteResult = { pasted: number; skipped: number };

/**
 * Pastes into `parentId` at `index` (the end when absent): this page's cut or copied items, or,
 * when `systemText` holds something else (another app copied since), a bookmark for each URL in
 * it. One undo entry. Null when there was nothing to paste.
 */
export async function pasteBookmarks(
  target: { parentId: string; index?: number },
  systemText?: string,
): Promise<BookmarkPasteResult | null> {
  const content = clipboard;
  const fromSystem =
    systemText !== undefined && systemText.trim() !== '' && systemText !== content?.text;
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
  if (content.mode === 'cut') {
    await recordBookmarkWrites({ action: 'move', count: content.ids.length }, async (writer) => {
      for (const [offset, id] of content.ids.entries()) {
        try {
          await writer.move(id, {
            parentId: target.parentId,
            ...(target.index === undefined ? {} : { index: target.index + offset }),
          });
          result.pasted += 1;
        } catch {
          // Deleted since, or a folder pasted into itself.
          result.skipped += 1;
        }
      }
    });
    // Cut items paste once, as in Chrome.
    clipboard = null;
    return result;
  }
  await recordBookmarkWrites({ action: 'add', count: content.nodes.length }, async (writer) => {
    for (const [offset, node] of content.nodes.entries()) {
      await createCopy(
        writer,
        node,
        target.parentId,
        target.index === undefined ? undefined : target.index + offset,
      );
      result.pasted += 1;
    }
  });
  return result;
}
