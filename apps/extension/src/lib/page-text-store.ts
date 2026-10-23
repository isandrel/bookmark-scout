/**
 * The page text index: the readable text of bookmarked pages the user chose to index (Index Page
 * Text), by bookmark id, in IndexedDB on this device only. It is derived data: deleting it never
 * touches a bookmark, a tag, or the History, and a page is indexed again when its address changes
 * or the extractor's version goes up (`config/bookmarks/page-text.toml`).
 *
 * Each record says where its text came from (`PageTextProvenance`): downloaded by a run or read
 * from the user's tab, the address it was read from, a fingerprint of the text, and whether the
 * page had more text than is kept. Records saved before that was kept (database version 1) are
 * still read and searched, and count as out of date, so the next run indexes them again.
 */
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';

const pageTextConfig = readConfig(
  'bookmarks/page-text',
  z.strictObject({
    max_chars_per_page: z.number().int().positive(),
    max_pages: z.number().int().positive(),
    timeout_ms: z.number().int().positive(),
    max_bytes: z.number().int().positive(),
    concurrency: z.number().int().positive(),
    busy_retries: boundedNumber({ integer: true }),
    extractor_version: z.number().int().positive(),
    text: z.strictObject({
      drop: z.array(z.string().min(1)).min(1),
      blocks: z.array(z.string().regex(/^[a-z][a-z0-9]*$/)).min(1),
    }),
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
  busyRetries: pageTextConfig.busy_retries,
  extractorVersion: pageTextConfig.extractor_version,
} as const;

/** What is kept of a page (`[text]` in the config): elements left out, and those that start a block. */
export const PAGE_TEXT_EXTRACTION = {
  dropSelector: pageTextConfig.text.drop.join(','),
  blockSelector: pageTextConfig.text.blocks.join(','),
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

/** How a page's text was captured: downloaded by Index Page Text, or read from the user's tab. */
export type PageTextSource = 'download' | 'tab';

/** Where an indexed page's text came from, kept with it. */
export type PageTextProvenance = {
  source: PageTextSource;
  /** The address the text was read from: the bookmark's own, or the one a download read instead. */
  readFrom: string;
  /** SHA-256 of the kept text (`sha256Hex`), so a later read can tell whether the text changed. */
  fingerprint: string;
  /** Whether the page had more readable text than `max_chars_per_page` keeps. */
  truncated: boolean;
};

/** One indexed page: what the bookmark's address showed when it was read. */
export type PageTextRecord = {
  bookmarkId: string;
  /** The bookmark's address when it was read; a bookmark at another address needs indexing again. */
  url: string;
  text: string;
  indexedAt: number;
  extractorVersion: number;
  /** Absent on a record saved before provenance was kept, which counts as out of date. */
  provenance?: PageTextProvenance;
};

const pageTextProvenanceSchema = z.strictObject({
  source: z.enum(['download', 'tab']),
  readFrom: z.string().min(1),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  truncated: z.boolean(),
}) satisfies z.ZodType<PageTextProvenance>;

const pageTextRecordSchema = z.strictObject({
  bookmarkId: z.string().min(1),
  url: z.string().min(1),
  text: z.string(),
  indexedAt: z.number().finite(),
  extractorVersion: z.number().int().positive(),
  provenance: pageTextProvenanceSchema.optional(),
}) satisfies z.ZodType<PageTextRecord>;

interface PageTextDb extends DBSchema {
  pages: { key: string; value: PageTextRecord };
}

/**
 * The database's versions, each with what it changed; it opens at the last one. 2: records carry
 * `provenance`. The store is unchanged, so version 1 records are kept as they are and read as out
 * of date (no provenance) until the next run indexes them again.
 */
const PAGE_TEXT_DB_VERSIONS = { pages: 1, provenance: 2 } as const;
const PAGE_TEXT_DB_VERSION = Math.max(...Object.values(PAGE_TEXT_DB_VERSIONS));

/** Broadcast after every change, so open pages read the index again. */
export const PAGE_TEXT_CHANNEL = 'bookmark-scout-page-text';

let database: Promise<IDBPDatabase<PageTextDb>> | undefined;

function openPageTextDb(): Promise<IDBPDatabase<PageTextDb>> {
  database ??= openDB<PageTextDb>(INDEXED_DATABASES.pageText.name, PAGE_TEXT_DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < PAGE_TEXT_DB_VERSIONS.pages) {
        db.createObjectStore('pages', { keyPath: 'bookmarkId' });
      }
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

/**
 * Whether `bookmark` has text indexed from its current address by the current extractor, with its
 * provenance: a record from an older extractor or from before provenance was kept is out of date.
 */
export function isPageTextCurrent(
  record: PageTextRecord | undefined,
  url: string,
): record is PageTextRecord & { provenance: PageTextProvenance } {
  return (
    record !== undefined &&
    record.url === url &&
    record.extractorVersion === PAGE_TEXT_LIMITS.extractorVersion &&
    record.provenance !== undefined
  );
}

/** How many pages a save kept, and how many it left out because storage was full. */
export type PageTextSaveResult = { saved: number; notSaved: number };

/** A page's text to save, read from `readFrom` (the bookmark's own address when absent). */
export type PageTextInput = Pick<PageTextRecord, 'bookmarkId' | 'url' | 'text'> & {
  readFrom?: string;
  /** Whether the reader already cut the text short (`PageTextReading`). */
  truncated?: boolean;
};

/**
 * Saves pages' text, each cut to `max_chars_per_page`, with where it came from (`source`). When
 * this device's storage for the extension runs out, the pages saved before it are kept and the
 * rest are counted in `notSaved` (`saveInBatches`), so the caller can say so instead of reporting
 * a full save.
 */
export async function savePageTexts(
  pages: readonly PageTextInput[],
  source: PageTextSource,
): Promise<PageTextSaveResult> {
  if (pages.length === 0) return { saved: 0, notSaved: 0 };
  const indexedAt = Date.now();
  // Worked out before any transaction: an await on other work would end it.
  const records = await Promise.all(
    pages.map(async (page): Promise<PageTextRecord> => {
      const text = page.text.slice(0, PAGE_TEXT_LIMITS.maxCharsPerPage);
      return {
        bookmarkId: page.bookmarkId,
        url: page.url,
        text,
        indexedAt,
        extractorVersion: PAGE_TEXT_LIMITS.extractorVersion,
        provenance: {
          source,
          readFrom: page.readFrom ?? page.url,
          fingerprint: await sha256Hex(text),
          truncated: page.truncated === true || text.length < page.text.length,
        },
      };
    }),
  );
  const db = await openPageTextDb();
  const { written, notWritten } = await saveInBatches(records, (batch) => {
    const transaction = db.transaction('pages', 'readwrite');
    return commitIndexedWrites(transaction, () =>
      batch.map((record) => transaction.store.put(record)),
    );
  });
  if (written > 0) announceChange();
  return { saved: written, notSaved: notWritten };
}

/** Removes the text of bookmarks that are gone, so deleted bookmarks leave nothing behind. */
export async function prunePageTexts(keepIds: ReadonlySet<string>): Promise<number> {
  const db = await openPageTextDb();
  const ids = await db.getAllKeys('pages');
  return removePageTexts(ids.filter((id) => !keepIds.has(id)));
}

/** Removes the text of the bookmarks `ids`; returns how many pages had text. */
export async function removePageTexts(ids: Iterable<string>): Promise<number> {
  const db = await openPageTextDb();
  const transaction = db.transaction('pages', 'readwrite');
  let removed = 0;
  for (const id of ids) {
    if (await transaction.store.getKey(id)) {
      await transaction.store.delete(id);
      removed += 1;
    }
  }
  await transaction.done;
  if (removed > 0) announceChange();
  return removed;
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
