/**
 * Subscribes to browser bookmark changes made anywhere (this page, other extension pages,
 * the browser UI, or sync) and calls back once per burst of events with what changed, so a page
 * can patch its tree (`applyBookmarkTreeChanges`) instead of reading it again.
 */

import { useEffect, useRef } from 'react';
import { z } from 'zod';
import type { BookmarkEventBatch, BookmarkTreeChange } from '@/lib/bookmark-tree-changes';

/** Bulk operations (imports, undo of a folder) fire many events; coalesce them into one batch. */
const BOOKMARK_EVENT_DEBOUNCE_MS = readConfig(
  'ui/timing',
  z.strictObject({ bookmark_event_debounce_ms: z.number().int().nonnegative() }),
).bookmark_event_debounce_ms;

type BookmarkEvent<Args extends unknown[]> = {
  addListener: (callback: (...args: Args) => void) => void;
  removeListener: (callback: (...args: Args) => void) => void;
};

type Subscription = { remove: () => void };

function subscribe<Args extends unknown[]>(
  event: BookmarkEvent<Args> | undefined,
  callback: (...args: Args) => void,
): Subscription[] {
  // onChildrenReordered and the import events are Chrome-only; Firefox leaves them undefined.
  if (!event?.addListener) return [];
  event.addListener(callback);
  return [{ remove: () => event.removeListener(callback) }];
}

/**
 * The browser updates a folder's modified date when its children change but sends no event for
 * it, so the folders a batch added to, removed from, or moved between are read again.
 */
async function withFolderDates(changes: BookmarkTreeChange[]): Promise<BookmarkTreeChange[]> {
  const folderIds = new Set<string>();
  for (const change of changes) {
    if (change.type === 'created' && change.node.parentId) folderIds.add(change.node.parentId);
    if (change.type === 'removed' || change.type === 'moved') folderIds.add(change.parentId);
    if (change.type === 'moved' && change.oldParentId) folderIds.add(change.oldParentId);
  }
  // A folder removed later in the same batch has no date to read.
  for (const change of changes) if (change.type === 'removed') folderIds.delete(change.id);
  if (folderIds.size === 0) return changes;
  const folders = await getBookmarksById([...folderIds]);
  return [
    ...changes,
    ...folders.map(
      (folder): BookmarkTreeChange => ({
        type: 'changed',
        id: folder.id,
        dateGroupModified: folder.dateGroupModified,
      }),
    ),
  ];
}

export function useBookmarkEvents(callback: (batch: BookmarkEventBatch) => void): void {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const api = browser.bookmarks as typeof browser.bookmarks | undefined;
    if (!api) return;

    let changes: BookmarkTreeChange[] = [];
    let reload = false;
    let importing = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Batches are delivered in order even while one is still reading folder dates.
    let delivery: Promise<void> = Promise.resolve();
    let active = true;

    const flush = () => {
      const batch = { changes, reload };
      changes = [];
      reload = false;
      delivery = delivery.then(async () => {
        if (!batch.reload && batch.changes.length > 0) {
          try {
            batch.changes = await withFolderDates(batch.changes);
          } catch {
            // A folder was removed meanwhile; read the whole tree instead.
            batch.reload = true;
          }
        }
        if (active) callbackRef.current(batch);
      });
    };
    const schedule = () => {
      if (importing) return;
      clearTimeout(timer);
      timer = setTimeout(flush, BOOKMARK_EVENT_DEBOUNCE_MS);
    };
    const record = (change: BookmarkTreeChange) => {
      changes.push(change);
      schedule();
    };

    const events = api as unknown as Partial<
      Record<'onChildrenReordered' | 'onImportBegan' | 'onImportEnded', BookmarkEvent<unknown[]>>
    >;
    const subscriptions = [
      ...subscribe(api.onCreated, (_id, node) => record({ type: 'created', node })),
      ...subscribe(api.onRemoved, (id, info) =>
        record({ type: 'removed', id, parentId: info.parentId }),
      ),
      ...subscribe(api.onChanged, (id, info) =>
        record({ type: 'changed', id, title: info.title, url: info.url }),
      ),
      ...subscribe(api.onMoved, (id, info) =>
        record({
          type: 'moved',
          id,
          parentId: info.parentId,
          index: info.index,
          oldParentId: info.oldParentId,
        }),
      ),
      ...subscribe(events.onChildrenReordered, (id, info) =>
        record({
          type: 'reordered',
          id: String(id),
          childIds: (info as { childIds: string[] }).childIds,
        }),
      ),
      // An import fires an event per node; skip them and read the whole tree once it ends.
      ...subscribe(events.onImportBegan, () => {
        importing = true;
        clearTimeout(timer);
      }),
      ...subscribe(events.onImportEnded, () => {
        importing = false;
        changes = [];
        reload = true;
        schedule();
      }),
    ];

    return () => {
      active = false;
      clearTimeout(timer);
      for (const subscription of subscriptions) subscription.remove();
    };
  }, []);
}
