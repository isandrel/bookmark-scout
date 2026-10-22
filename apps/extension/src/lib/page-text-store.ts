/**
 * The page text index: the readable text of bookmarked pages the user chose to index (Index Page
 * Text), by bookmark id, in IndexedDB on this device only. It is derived data: deleting it never
 * touches a bookmark, a tag, or the History, and a page is indexed again when its address changes
 * or the extractor's version goes up (`config/bookmarks/page-text.toml`).
 */
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import { z } from 'zod';

const pageTextConfig = readConfig(
  'bookmarks/page-text',
  z.strictObject({
    max_chars_per_page: z.number().int().positive(),
    max_pages: z.number().int().positive(),
    timeout_ms: z.number().int().positive(),
    max_bytes: z.number().int().positive(),
    concurrency: z.number().int().positive(),
    extractor_version: z.number().int().positive(),
    sign_in: z.strictObject({
      fields: z.array(z.string().min(1)).min(1),
      outside: z.array(z.string().min(1)),
      max_text_chars: z.number().int().positive(),
      http_statuses: z.array(httpStatusCodeSchema),
    }),
  }),
);

export const PAGE_TEXT_LIMITS = {
  maxCharsPerPage: pageTextConfig.max_chars_per_page,
  maxPages: pageTextConfig.max_pages,
  timeoutMs: pageTextConfig.timeout_ms,
  maxBytes: pageTextConfig.max_bytes,
  concurrency: pageTextConfig.concurrency,
  extractorVersion: pageTextConfig.extractor_version,
} as const;

/**
 * How a sign-in page is told apart from content (`[sign_in]` in the config): a password field in
 * the main content with little readable text, or an answer such as 401 Unauthorized.
 */
export const PAGE_TEXT_SIGN_IN = {
  fieldSelector: pageTextConfig.sign_in.fields.join(','),
  outsideSelector: pageTextConfig.sign_in.outside.join(','),
  maxTextChars: pageTextConfig.sign_in.max_text_chars,
  httpStatuses: new Set<number>(pageTextConfig.sign_in.http_statuses),
} as const;

/** One indexed page: what the bookmark's address showed when it was read. */
export type PageTextRecord = {
  bookmarkId: string;
  /** The address it was read from; a bookmark at another address needs indexing again. */
  url: string;
  text: string;
  indexedAt: number;
  extractorVersion: number;
};

const pageTextRecordSchema = z.strictObject({
  bookmarkId: z.string().min(1),
  url: z.string().min(1),
  text: z.string(),
  indexedAt: z.number().finite(),
  extractorVersion: z.number().int().positive(),
});

interface PageTextDb extends DBSchema {
  pages: { key: string; value: PageTextRecord };
}

const PAGE_TEXT_DB_VERSION = 1;

/** Broadcast after every change, so open pages read the index again. */
export const PAGE_TEXT_CHANNEL = 'bookmark-scout-page-text';

let database: Promise<IDBPDatabase<PageTextDb>> | undefined;

function openPageTextDb(): Promise<IDBPDatabase<PageTextDb>> {
  database ??= openDB<PageTextDb>(INDEXED_DATABASES.pageText.name, PAGE_TEXT_DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('pages', { keyPath: 'bookmarkId' });
    },
  });
  return database;
}

function announceChange(): void {
  const channel = new BroadcastChannel(PAGE_TEXT_CHANNEL);
  channel.postMessage('changed');
  channel.close();
}

/** Every indexed page, by bookmark id; records that do not parse are left out. */
export async function getPageTexts(): Promise<Map<string, PageTextRecord>> {
  const records = await (await openPageTextDb()).getAll('pages');
  const pages = new Map<string, PageTextRecord>();
  for (const record of records) {
    const parsed = pageTextRecordSchema.safeParse(record);
    if (parsed.success) pages.set(parsed.data.bookmarkId, parsed.data);
  }
  return pages;
}

/** Whether `bookmark` has text indexed from its current address by the current extractor. */
export function isPageTextCurrent(
  record: PageTextRecord | undefined,
  url: string,
): record is PageTextRecord {
  return (
    record !== undefined &&
    record.url === url &&
    record.extractorVersion === PAGE_TEXT_LIMITS.extractorVersion
  );
}

/** Saves pages' text, each cut to `max_chars_per_page`. */
export async function savePageTexts(
  pages: readonly Pick<PageTextRecord, 'bookmarkId' | 'url' | 'text'>[],
): Promise<number> {
  if (pages.length === 0) return 0;
  const db = await openPageTextDb();
  const transaction = db.transaction('pages', 'readwrite');
  const indexedAt = Date.now();
  for (const page of pages) {
    await transaction.store.put({
      bookmarkId: page.bookmarkId,
      url: page.url,
      text: page.text.slice(0, PAGE_TEXT_LIMITS.maxCharsPerPage),
      indexedAt,
      extractorVersion: PAGE_TEXT_LIMITS.extractorVersion,
    });
  }
  await transaction.done;
  announceChange();
  return pages.length;
}

/** Removes the text of bookmarks that are gone, so deleted bookmarks leave nothing behind. */
export async function prunePageTexts(keepIds: ReadonlySet<string>): Promise<number> {
  const db = await openPageTextDb();
  const ids = await db.getAllKeys('pages');
  const gone = ids.filter((id) => !keepIds.has(id));
  if (gone.length === 0) return 0;
  const transaction = db.transaction('pages', 'readwrite');
  for (const id of gone) await transaction.store.delete(id);
  await transaction.done;
  announceChange();
  return gone.length;
}

/** Deletes the whole index; bookmarks, tags, and the History are not touched. */
export async function clearPageTexts(): Promise<void> {
  await (await openPageTextDb()).clear('pages');
  announceChange();
}

/** How many pages are indexed and how many characters of text they keep. */
export async function getPageTextSummary(): Promise<{ pages: number; chars: number }> {
  const pages = await getPageTexts();
  let chars = 0;
  for (const page of pages.values()) chars += page.text.length;
  return { pages: pages.size, chars };
}

/** Calls back after each change to the index, from any page; returns the unsubscribe. */
export function watchPageTexts(callback: () => void): () => void {
  const channel = new BroadcastChannel(PAGE_TEXT_CHANNEL);
  channel.onmessage = () => callback();
  return () => channel.close();
}
