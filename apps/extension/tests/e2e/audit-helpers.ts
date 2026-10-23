/**
 * Reads the Bookmark Audit History (IndexedDB `bookmark-scout-audit`) and what derived-data tools
 * must leave alone, from the service worker: a test takes `libraryState` before a tool runs or
 * deletes its data and compares it after, so a tool that only reads (Index Page Text, Fetch
 * Covers, their Delete buttons) is shown to change no bookmark, tag, or History record.
 */
import { expect, type Worker } from '@playwright/test';
import { INDEXED_DATABASES } from '../../src/lib/storage/registry';
import { readStored, STORAGE_ITEMS } from './storage';

/** Waits until the background has taken its first baseline of the bookmarks. */
export async function waitForAuditBaseline(worker: Worker) {
  await expect
    .poll(() =>
      worker.evaluate(
        (name) =>
          new Promise<boolean>((resolve) => {
            const open = indexedDB.open(name);
            open.onsuccess = () => {
              const db = open.result;
              if (!db.objectStoreNames.contains('meta')) return resolve(false);
              const read = db.transaction('meta').objectStore('meta').get('observer');
              read.onsuccess = () => resolve(read.result !== undefined);
              read.onerror = () => resolve(false);
            };
            open.onerror = () => resolve(false);
          }),
        INDEXED_DATABASES.bookmarkAudit.name,
      ),
    )
    .toBe(true);
}

/** How many records the Audit History holds. */
export function auditRecordCount(worker: Worker): Promise<number> {
  return worker.evaluate(
    (name) =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open(name);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('operations')) return resolve(0);
          const count = db.transaction('operations').objectStore('operations').count();
          count.onsuccess = () => resolve(count.result);
          count.onerror = () => resolve(-1);
        };
        open.onerror = () => resolve(-1);
      }),
    INDEXED_DATABASES.bookmarkAudit.name,
  );
}

/** A folder's bookmarks as the browser has them, the local tags and summaries, and the History. */
export async function libraryState(worker: Worker, folderId: string) {
  const [bookmarks, metadata, auditRecords] = await Promise.all([
    worker.evaluate(
      async (id) =>
        (await chrome.bookmarks.getSubTree(id)).map(function strip(node): unknown {
          return {
            id: node.id,
            title: node.title,
            url: node.url,
            children: node.children?.map(strip),
          };
        }),
      folderId,
    ),
    readStored(worker, STORAGE_ITEMS.bookmarkMetadata),
    auditRecordCount(worker),
  ]);
  return { bookmarks, metadata, auditRecords };
}

/**
 * The library state once the History has recorded what seeding did: the record count stays the
 * same over two reads, so a record still being written is not taken for one a tool added later.
 */
export async function settledLibraryState(worker: Worker, folderId: string) {
  let previous = -1;
  await expect
    .poll(async () => {
      const count = await auditRecordCount(worker);
      const settled = count > 0 && count === previous;
      previous = count;
      return settled;
    })
    .toBe(true);
  return libraryState(worker, folderId);
}
