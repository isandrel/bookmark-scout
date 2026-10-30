/**
 * Where a bookmark drag and drop lands, and what it carries. A folder row has three zones
 * (before, into, after) and a bookmark row two, sized by config/ui/drag-drop.toml for both the
 * popup tree (`tree-drop.ts`) and the manager. The manager follows Chrome's (`dnd_manager.ts`):
 * rows reorder only while the table shows the folder in the browser's own order, and otherwise
 * a folder takes the drop into it. Pure, so it is unit tested; `use-manager-drag-drop` wires the
 * manager's part to the DOM.
 */
import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';

const dragConfig = readConfig(
  'ui/drag-drop',
  z.strictObject({
    folder_edge_fraction: boundedNumber({ integer: false }),
    bookmark_split_fraction: z.number().gt(0).lt(1),
    unmeasured_fraction: z.number().min(0).max(1),
    manager_auto_expand_ms: z.number().int().nonnegative(),
    preview_max_width_px: z.number().int().positive(),
    preview_offset_px: z.number().int().nonnegative(),
  }),
);

/** How long a drag hovers over a closed folder in the manager's tree before it opens. */
export const MANAGER_DRAG_AUTO_EXPAND_MS = dragConfig.manager_auto_expand_ms;

/** The drag preview's widest and its distance from the pointer, in pixels. */
export const DRAG_PREVIEW_MAX_WIDTH_PX = dragConfig.preview_max_width_px;
export const DRAG_PREVIEW_OFFSET_PX = dragConfig.preview_offset_px;

/** The data type that marks a drag of the manager's own bookmarks (their ids, as JSON). */
export const MANAGER_DRAG_TYPE = MIME.bookmarkIds;

export type BookmarkDropZone = 'before' | 'into' | 'after';

/**
 * How far down a row (`top`, `height`) the pointer is, from 0 to 1; the configured position when
 * the row has no height, or the pointer is outside it (a drag event without a position).
 */
export function rowFraction(
  clientY: number,
  row: { top: number; height: number } | undefined,
): number {
  if (!row || row.height <= 0) return dragConfig.unmeasured_fraction;
  const fraction = (clientY - row.top) / row.height;
  return fraction >= 0 && fraction <= 1 ? fraction : dragConfig.unmeasured_fraction;
}

/** The zone at `fraction` of a row's height, for a row that takes drops beside it. */
export function dropZoneAt(isFolder: boolean, fraction: number): BookmarkDropZone {
  if (!isFolder) return fraction < dragConfig.bookmark_split_fraction ? 'before' : 'after';
  if (fraction < dragConfig.folder_edge_fraction) return 'before';
  if (fraction > 1 - dragConfig.folder_edge_fraction) return 'after';
  return 'into';
}

/** The item under the pointer. */
export type ManagerDropTarget = {
  id: string;
  parentId?: string;
  isFolder: boolean;
  /** False for the top-level and managed folders, which never move. */
  movable: boolean;
};

/** The zone of `target` at `fraction` of its height, or null where it takes no drop. */
export function getManagerDropZone(
  target: ManagerDropTarget,
  fraction: number,
  canReorder: boolean,
): BookmarkDropZone | null {
  if (!canReorder || !target.movable) return target.isFolder ? 'into' : null;
  return dropZoneAt(target.isFolder, fraction);
}

/** Where dropped items go: into `parentId`, before `beforeId` (the end when null). */
export type ManagerDropDestination = { parentId: string; beforeId: string | null };

type TreeItem = { id: string; parentId?: string; index?: number };

/**
 * The destination of a drop in `zone` of `target`, or null when it would do nothing or is not
 * allowed: onto a dragged item, or a folder into itself or anything inside it.
 */
export function resolveManagerDrop(
  draggedIds: readonly string[],
  target: ManagerDropTarget,
  zone: BookmarkDropZone,
  items: readonly TreeItem[],
): ManagerDropDestination | null {
  const dragged = new Set(draggedIds);
  const parentId = zone === 'into' ? target.id : target.parentId;
  if (!parentId) return null;
  const byId = new Map(items.map((item) => [item.id, item]));
  // A folder cannot go into itself or anything inside it.
  for (let id: string | undefined = parentId; id; id = byId.get(id)?.parentId) {
    if (dragged.has(id)) return null;
  }
  if (zone === 'into') return { parentId, beforeId: null };
  if (dragged.has(target.id)) return null;
  if (zone === 'before') return { parentId, beforeId: target.id };
  // After the target: before the first following sibling that is not itself dragged.
  const following = items
    .filter(
      (item) => item.parentId === parentId && (item.index ?? 0) > (byId.get(target.id)?.index ?? 0),
    )
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .find((item) => !dragged.has(item.id));
  return { parentId, beforeId: following?.id ?? null };
}

/** The parts of a DataTransfer a drop reads. */
export type DroppedData = { uriList?: string; plain?: string; html?: string; mozUrl?: string };

/**
 * The links dropped from another page or app: `MIME.uriList` (or Firefox's `MIME.mozUrl`, or
 * plain text holding URLs), titled from the HTML links that came with them, else by the URL.
 */
export function parseDroppedLinks(data: DroppedData): { url: string; title: string }[] {
  const titles = new Map<string, string>();
  if (data.html && typeof DOMParser !== 'undefined') {
    const document = parseFetchedHtml(data.html);
    for (const anchor of document.querySelectorAll('a[href]')) {
      const title = anchor.textContent?.trim();
      if (title) titles.set(anchor.getAttribute('href') ?? '', title);
    }
  }
  // text/x-moz-url alternates URL and title lines.
  const mozLines = data.mozUrl ? data.mozUrl.split(/\r?\n/).map((line) => line.trim()) : [];
  const mozUrls = mozLines.filter((line, index) => index % 2 === 0 && line);
  for (let line = 0; line + 1 < mozLines.length; line += 2) {
    if (mozLines[line + 1]) titles.set(mozLines[line], mozLines[line + 1]);
  }
  const listed = (data.uriList ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const candidates = listed.length > 0 ? listed : mozUrls;
  const urls =
    candidates.length > 0 ? candidates.filter(isBookmarkableUrl) : urlsInText(data.plain ?? '');
  return [...new Set(urls)].map((url) => ({ url, title: titles.get(url) ?? url }));
}

/** The URLs in pasted or dropped text, separated by spaces or lines; bookmarkable ones only. */
export function urlsInText(text: string): string[] {
  return text.split(/\s+/).filter(isBookmarkableUrl);
}

/** http(s), ftp, and file URLs: what a dropped or pasted link may become. */
export function isBookmarkableUrl(text: string): boolean {
  try {
    return ['http:', 'https:', 'ftp:', 'file:'].includes(new URL(text).protocol);
  } catch {
    return false;
  }
}
