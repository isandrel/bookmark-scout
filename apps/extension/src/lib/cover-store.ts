/**
 * Bookmark covers: a small copy of the preview image each page names for itself, kept by bookmark
 * id in IndexedDB on this device only, for the manager's cards (Fetch Covers). It is derived data:
 * deleting it never touches a bookmark, a tag, or the History. A cover belongs to the address it
 * was fetched from, so a bookmark moved to another address shows none until it is fetched again,
 * and the oldest covers go first when the total passes the Cover Storage setting.
 */
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import { z } from 'zod';

const coverConfig = readConfig(
  'bookmarks/covers',
  z.strictObject({
    meta_names: z.array(z.string().min(1)),
    types: z.array(z.string().startsWith('image/')).min(1),
    max_pixels: z.number().int().positive(),
    output_type: z.string().startsWith('image/'),
    output_quality: z.number().min(0).max(1),
    min_width_px: z.number().int().positive(),
    timeout_ms: z.number().int().positive(),
    max_page_bytes: z.number().int().positive(),
    concurrency: z.number().int().positive(),
    version: z.number().int().positive(),
  }),
);

export const COVER_LIMITS = {
  metaNames: coverConfig.meta_names,
  types: new Set(coverConfig.types),
  maxPixels: coverConfig.max_pixels,
  outputType: coverConfig.output_type,
  outputQuality: coverConfig.output_quality,
  minWidthPx: coverConfig.min_width_px,
  timeoutMs: coverConfig.timeout_ms,
  maxPageBytes: coverConfig.max_page_bytes,
  concurrency: coverConfig.concurrency,
  version: coverConfig.version,
} as const;

/** What is known about a stored cover without reading its image. */
export type CoverInfo = {
  bookmarkId: string;
  /** The bookmark's address when the cover was fetched; another address has no cover. */
  url: string;
  width: number;
  height: number;
  bytes: number;
  savedAt: number;
  version: number;
};

/** A cover to store: its info and the image file. */
export type CoverImage = Pick<CoverInfo, 'bookmarkId' | 'url' | 'width' | 'height'> & {
  type: string;
  data: ArrayBuffer;
};

const coverInfoSchema = z.strictObject({
  bookmarkId: z.string().min(1),
  url: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().nonnegative(),
  savedAt: z.number().finite(),
  version: z.number().int().positive(),
});

type StoredImage = { bookmarkId: string; type: string; data: ArrayBuffer };

interface CoverDb extends DBSchema {
  /** Small records read to list, count, and check covers. */
  info: { key: string; value: CoverInfo };
  /** The image files, read one at a time when a card shows. */
  images: { key: string; value: StoredImage };
}

const COVER_DB_VERSION = 1;

/** Broadcast after every change, so open pages show the covers again. */
export const COVER_CHANNEL = 'bookmark-scout-covers';

let database: Promise<IDBPDatabase<CoverDb>> | undefined;

function openCoverDb(): Promise<IDBPDatabase<CoverDb>> {
  database ??= openDB<CoverDb>(INDEXED_DATABASES.covers.name, COVER_DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('info', { keyPath: 'bookmarkId' });
      db.createObjectStore('images', { keyPath: 'bookmarkId' });
    },
  });
  return database;
}

const listeners = new Set<() => void>();
let channel: BroadcastChannel | undefined;
let changeCount = 0;

function notify(): void {
  changeCount += 1;
  for (const listener of listeners) listener();
}

function announceChange(): void {
  const sender = new BroadcastChannel(COVER_CHANNEL);
  sender.postMessage('changed');
  sender.close();
  // A channel does not hear its own page; tell this page's listeners too.
  notify();
}

/**
 * Calls back after each change to the covers, from any page; returns the unsubscribe. Every
 * listener on a page shares one channel, so a page of cards opens one, not one a card.
 */
export function watchCovers(callback: () => void): () => void {
  listeners.add(callback);
  if (!channel) {
    channel = new BroadcastChannel(COVER_CHANNEL);
    channel.onmessage = notify;
  }
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0) {
      channel?.close();
      channel = undefined;
    }
  };
}

/** Goes up with each change this page hears of, for `useSyncExternalStore`. */
export function getCoverChangeCount(): number {
  return changeCount;
}

/** Every stored cover's info, by bookmark id; records that do not parse are left out. */
export async function getCoverInfos(): Promise<Map<string, CoverInfo>> {
  const records = await (await openCoverDb()).getAll('info');
  const covers = new Map<string, CoverInfo>();
  for (const record of records) {
    const parsed = coverInfoSchema.safeParse(record);
    if (parsed.success) covers.set(parsed.data.bookmarkId, parsed.data);
  }
  return covers;
}

/** Whether `info` is a cover of `url` made the current way. */
export function isCoverCurrent(info: CoverInfo | undefined, url: string): info is CoverInfo {
  return info !== undefined && info.url === url && info.version === COVER_LIMITS.version;
}

/** The cover image of a bookmark at `url`, or undefined when it has none for that address. */
export async function getCoverImage(bookmarkId: string, url: string): Promise<Blob | undefined> {
  const db = await openCoverDb();
  const info = coverInfoSchema.safeParse(await db.get('info', bookmarkId));
  if (!info.success || info.data.url !== url) return undefined;
  const image = await db.get('images', bookmarkId);
  return image ? new Blob([image.data], { type: image.type }) : undefined;
}

/**
 * Reads a cover with `load` and gives `show` an object URL for it (undefined without one, or
 * when the read fails). The returned function stops it for a card that is gone: a read still
 * running is ignored when it ends, so no URL is made for it, and a URL already made is revoked.
 */
export function showCoverImage(
  load: () => Promise<Blob | undefined>,
  show: (src: string | undefined) => void,
): () => void {
  let objectUrl: string | undefined;
  let stopped = false;
  load()
    .then((image) => {
      if (stopped) return;
      objectUrl = image ? URL.createObjectURL(image) : undefined;
      show(objectUrl);
    })
    .catch(() => {
      if (!stopped) show(undefined);
    });
  return () => {
    stopped = true;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  };
}

async function deleteCovers(db: IDBPDatabase<CoverDb>, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const transaction = db.transaction(['info', 'images'], 'readwrite');
  for (const id of ids) {
    await transaction.objectStore('info').delete(id);
    await transaction.objectStore('images').delete(id);
  }
  await transaction.done;
}

/**
 * Stores covers, then removes the oldest until all of them fit in `maxBytes`. Returns how many of
 * `covers` are kept.
 */
export async function saveCovers(covers: readonly CoverImage[], maxBytes: number): Promise<number> {
  if (covers.length === 0) return 0;
  const db = await openCoverDb();
  const transaction = db.transaction(['info', 'images'], 'readwrite');
  const savedAt = Date.now();
  for (const cover of covers) {
    await transaction.objectStore('info').put({
      bookmarkId: cover.bookmarkId,
      url: cover.url,
      width: cover.width,
      height: cover.height,
      bytes: cover.data.byteLength,
      savedAt,
      version: COVER_LIMITS.version,
    });
    await transaction
      .objectStore('images')
      .put({ bookmarkId: cover.bookmarkId, type: cover.type, data: cover.data });
  }
  await transaction.done;
  const infos = [...(await getCoverInfos()).values()].sort((a, b) => b.savedAt - a.savedAt);
  let total = 0;
  const evicted: string[] = [];
  for (const info of infos) {
    total += info.bytes;
    if (total > maxBytes) evicted.push(info.bookmarkId);
  }
  await deleteCovers(db, evicted);
  announceChange();
  const gone = new Set(evicted);
  return covers.filter((cover) => !gone.has(cover.bookmarkId)).length;
}

/** Removes the covers of bookmarks that are gone, so deleted bookmarks leave nothing behind. */
export async function pruneCovers(keepIds: ReadonlySet<string>): Promise<number> {
  const db = await openCoverDb();
  const gone = (await db.getAllKeys('info')).filter((id) => !keepIds.has(id));
  await deleteCovers(db, gone);
  if (gone.length) announceChange();
  return gone.length;
}

/** Deletes every cover; bookmarks, tags, and the History are not touched. */
export async function clearCovers(): Promise<void> {
  const db = await openCoverDb();
  const transaction = db.transaction(['info', 'images'], 'readwrite');
  await transaction.objectStore('info').clear();
  await transaction.objectStore('images').clear();
  await transaction.done;
  announceChange();
}

/** How many covers are stored and how many bytes they take. */
export async function getCoverSummary(): Promise<{ covers: number; bytes: number }> {
  let bytes = 0;
  const infos = await getCoverInfos();
  for (const info of infos.values()) bytes += info.bytes;
  return { covers: infos.size, bytes };
}
