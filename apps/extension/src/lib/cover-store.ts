/**
 * Bookmark covers: a small copy of the preview image each page names for itself (Fetch Covers), or
 * a picture of the tab (Use this view as the cover, Capture Covers While Browsing), kept by
 * bookmark id in IndexedDB on this device only, for the manager's cards. It is derived data:
 * deleting it never touches a bookmark, a tag, or the History. A cover belongs to the address it
 * was fetched from, so a bookmark moved to another address shows none until it is fetched again;
 * a deleted bookmark's cover is deleted with it. When the total passes the Cover Storage setting,
 * the oldest covers go first, and covers the user chose last. They never sync; the backup file can
 * hold them, by address (`services/cover-backup.lazy.ts`).
 */
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';

const coverConfig = readConfig(
  'bookmarks/covers',
  z.strictObject({
    meta_names: z.array(z.string().min(1)),
    types: z.array(z.string().startsWith('image/')).min(1),
    max_pixels: z.number().int().positive(),
    output_type: z.string().startsWith('image/'),
    min_width_px: z.number().int().positive(),
    timeout_ms: z.number().int().positive(),
    max_page_bytes: z.number().int().positive(),
    concurrency: z.number().int().positive(),
    max_found_per_run: boundedNumber({ integer: true }),
    version: z.number().int().positive(),
  }),
);

export const COVER_LIMITS = {
  metaNames: coverConfig.meta_names,
  types: new Set(coverConfig.types),
  maxPixels: coverConfig.max_pixels,
  outputType: coverConfig.output_type,
  minWidthPx: coverConfig.min_width_px,
  timeoutMs: coverConfig.timeout_ms,
  maxPageBytes: coverConfig.max_page_bytes,
  concurrency: coverConfig.concurrency,
  maxFoundPerRun: coverConfig.max_found_per_run,
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
  source: StoredCoverSource;
};

/** A cover to store: its info and the image file. */
export type CoverImage = Pick<CoverInfo, 'bookmarkId' | 'url' | 'width' | 'height'> & {
  source: CoverSource;
  type: string;
  data: ArrayBuffer;
};

/** A cover's info as kept: a cover saved before sources were recorded has no source. */
const storedInfoSchema = z.strictObject({
  bookmarkId: z.string().min(1),
  url: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().nonnegative(),
  savedAt: z.number().finite(),
  version: z.number().int().positive(),
  // Absent in covers saved before sources were recorded.
  source: z.enum(COVER_SOURCES).optional(),
});

const coverInfoSchema = storedInfoSchema.transform(
  ({ source, ...info }): CoverInfo => ({ ...info, source: source ?? UNKNOWN_COVER_SOURCE }),
);

type StoredImage = { bookmarkId: string; type: string; data: ArrayBuffer };

/** A cover's info as kept: a cover saved before sources were recorded has none. */
type StoredInfo = Omit<CoverInfo, 'source'> & { source?: CoverSource };

/** A cover's info as written: no source for one saved before sources were recorded. */
function toStoredInfo({ source, ...info }: CoverInfo): StoredInfo {
  return source === UNKNOWN_COVER_SOURCE ? info : { ...info, source };
}

interface CoverDb extends DBSchema {
  /** Small records read to list, count, and check covers. */
  info: { key: string; value: StoredInfo };
  /** The image files, read one at a time when a card shows. */
  images: { key: string; value: StoredImage };
}

const COVER_DB_VERSION = 1;

/**
 * Broadcast after every change with the ids of the bookmarks whose cover changed (`{ ids }`), or
 * `changed` when every cover may have, so open pages read again only the covers that changed.
 */
export const COVER_CHANNEL = 'bookmark-scout-covers';

/** A change message naming bookmarks; anything else (`changed`) is a change to every cover. */
const coverChangeSchema = z.strictObject({ ids: z.array(z.string()) });

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
/** Changes to every cover (`clearCovers`, or a message that names no ids). */
let allChanges = 0;
/** Changes to one bookmark's cover, by bookmark id. */
const coverChanges = new Map<string, number>();

/** Counts a change to the covers of `ids` (every cover without), then tells this page. */
function notify(ids?: readonly string[]): void {
  changeCount += 1;
  if (ids) {
    for (const id of ids) coverChanges.set(id, (coverChanges.get(id) ?? 0) + 1);
  } else {
    allChanges += 1;
  }
  for (const listener of listeners) listener();
}

function announceChange(ids?: Iterable<string>): void {
  const changed = ids ? [...ids] : undefined;
  const message = changed ? { ids: changed } : 'changed';
  // Sent through this page's own channel when it listens, which never hears its own messages
  // (another channel object of this page would), so this page counts each change once.
  if (channel) {
    channel.postMessage(message);
  } else {
    const sender = new BroadcastChannel(COVER_CHANNEL);
    sender.postMessage(message);
    sender.close();
  }
  notify(changed);
}

/**
 * Calls back after each change to the covers, from any page; returns the unsubscribe. Every
 * listener on a page shares one channel, so a page of cards opens one, not one a card.
 */
export function watchCovers(callback: () => void): () => void {
  listeners.add(callback);
  if (!channel) {
    channel = new BroadcastChannel(COVER_CHANNEL);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const change = coverChangeSchema.safeParse(event.data);
      notify(change.success ? change.data.ids : undefined);
    };
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

/**
 * Goes up with each change this page hears of to the cover of `bookmarkId` (or to every cover),
 * for `useSyncExternalStore`: a card reads its cover again only when that cover changed.
 */
export function getCoverRevision(bookmarkId: string): number {
  return allChanges + (coverChanges.get(bookmarkId) ?? 0);
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

/**
 * Whether `info` is a cover of `url` the user chose (`isKeptCover`), which no automatic cover
 * replaces: whatever version made it, so raising `version` never makes a chosen cover replaceable.
 */
export function isKeptCoverOf(info: CoverInfo | undefined, url: string): boolean {
  return info !== undefined && info.url === url && isKeptCover(info.source);
}

/** The info of a bookmark's cover of `url`, or undefined when it has none for that address. */
export async function getCoverInfo(
  bookmarkId: string,
  url: string,
): Promise<CoverInfo | undefined> {
  const info = coverInfoSchema.safeParse(await (await openCoverDb()).get('info', bookmarkId));
  return info.success && info.data.url === url ? info.data : undefined;
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
 * The covers to remove so the rest fit in `maxBytes`: covers the user chose (`isKeptCover`) last,
 * and of the others the oldest first, by `savedAt`. Also used to preview a restore before anything
 * is written.
 */
export function coversOverLimit(
  infos: Iterable<Pick<CoverInfo, 'bookmarkId' | 'bytes' | 'savedAt' | 'source'>>,
  maxBytes: number,
): Set<string> {
  let total = 0;
  const over = new Set<string>();
  const keptFirst = [...infos].sort(
    (a, b) =>
      Number(isKeptCover(b.source)) - Number(isKeptCover(a.source)) || b.savedAt - a.savedAt,
  );
  for (const info of keptFirst) {
    total += info.bytes;
    if (total > maxBytes) over.add(info.bookmarkId);
  }
  return over;
}

/** Removes covers until the rest fit in `maxBytes` (`coversOverLimit`); resolves to those ids. */
async function evictOverLimit(db: IDBPDatabase<CoverDb>, maxBytes: number): Promise<Set<string>> {
  const evicted = coversOverLimit((await getCoverInfos()).values(), maxBytes);
  await deleteCovers(db, [...evicted]);
  return evicted;
}

/** How many covers a save kept, and how many it left out because storage was full. */
export type CoverSaveResult = { saved: number; notSaved: number };

/** A stored cover exactly as kept (its info record and image), to put back after a removal. */
export type StoredCoverRecord = { info: StoredInfo; image: StoredImage };

/**
 * Stores covers, then removes covers until all of them fit in `maxBytes` (`coversOverLimit`).
 * A cover found automatically (any source but one the user chooses, `isKeptCover`) is not written
 * over a cover of the same address the user chose, checked in the transaction that writes it, so
 * a review or a picture that checked before the user chose one never replaces it. `saved` counts
 * the covers of `covers` kept. When this device's storage for the extension runs out, the covers
 * stored before it are kept and the rest are counted in `notSaved` (`saveInBatches`); a cover's
 * info and image are written in one transaction, so neither is kept without the other. With
 * `keepReplaced`, `replaced` holds the covers of the same address the save wrote over, as they
 * were stored, for `putBackCovers`.
 */
export async function saveCovers(
  covers: readonly CoverImage[],
  maxBytes: number,
  { keepReplaced = false }: { keepReplaced?: boolean } = {},
): Promise<CoverSaveResult & { replaced: StoredCoverRecord[] }> {
  if (covers.length === 0) return { saved: 0, notSaved: 0, replaced: [] };
  const db = await openCoverDb();
  const savedAt = Date.now();
  const kept = new Set<string>();
  const replaced: StoredCoverRecord[] = [];
  const { written, notWritten } = await saveInBatches(covers, async (batch) => {
    const transaction = db.transaction(['info', 'images'], 'readwrite');
    const infoStore = transaction.objectStore('info');
    const imageStore = transaction.objectStore('images');
    const batchKept: string[] = [];
    const batchReplaced: StoredCoverRecord[] = [];
    await commitIndexedWrites(transaction, () =>
      batch.map(async (cover) => {
        const stored = await infoStore.get(cover.bookmarkId);
        const current = coverInfoSchema.safeParse(stored);
        const shown = current.success && current.data.url === cover.url ? current.data : undefined;
        if (!isKeptCover(cover.source) && isKeptCoverOf(shown, cover.url)) return;
        if (keepReplaced && stored && shown) {
          const image = await imageStore.get(cover.bookmarkId);
          if (image) batchReplaced.push({ info: stored, image });
        }
        await Promise.all([
          infoStore.put({
            bookmarkId: cover.bookmarkId,
            url: cover.url,
            width: cover.width,
            height: cover.height,
            bytes: cover.data.byteLength,
            savedAt,
            version: COVER_LIMITS.version,
            source: cover.source,
          }),
          imageStore.put({ bookmarkId: cover.bookmarkId, type: cover.type, data: cover.data }),
        ]);
        batchKept.push(cover.bookmarkId);
      }),
    );
    // Only once the batch is committed: a batch storage refused wrote nothing.
    for (const id of batchKept) kept.add(id);
    replaced.push(...batchReplaced);
  });
  if (written === 0 || kept.size === 0) return { saved: 0, notSaved: notWritten, replaced };
  const gone = await evictOverLimit(db, maxBytes);
  announceChange(new Set([...kept, ...gone]));
  return {
    saved: covers.filter((cover) => kept.has(cover.bookmarkId) && !gone.has(cover.bookmarkId))
      .length,
    notSaved: notWritten,
    replaced,
  };
}

/** Removes the covers of bookmarks that are gone, so deleted bookmarks leave nothing behind. */
export async function pruneCovers(keepIds: ReadonlySet<string>): Promise<number> {
  const db = await openCoverDb();
  const gone = (await db.getAllKeys('info')).filter((id) => !keepIds.has(id));
  await deleteCovers(db, gone);
  if (gone.length) announceChange(gone);
  return gone.length;
}

/**
 * Deletes the covers of `bookmarkIds`, the bookmarks just deleted (the background, on every
 * removal); resolves to how many had one. A bookmark brought back gets a new id, and a new cover.
 */
export async function removeCovers(bookmarkIds: Iterable<string>): Promise<number> {
  const db = await openCoverDb();
  const transaction = db.transaction(['info', 'images'], 'readwrite');
  const removed: string[] = [];
  for (const id of bookmarkIds) {
    const [info, image] = await Promise.all([
      transaction.objectStore('info').getKey(id),
      transaction.objectStore('images').getKey(id),
    ]);
    if (info === undefined && image === undefined) continue;
    await transaction.objectStore('info').delete(id);
    await transaction.objectStore('images').delete(id);
    removed.push(id);
  }
  await transaction.done;
  if (removed.length > 0) announceChange(removed);
  return removed.length;
}

/** A stored cover's info, read and checked, and its image: what a backup holds of it. */
export type CoverRecord = { info: CoverInfo; image: StoredImage };

/**
 * Deletes the covers of `bookmarkIds` and returns them as they were stored (a cover saved before
 * sources were recorded keeps its shape), for `putBackCovers`. Ids without a cover are skipped.
 */
export async function takeCovers(bookmarkIds: readonly string[]): Promise<StoredCoverRecord[]> {
  const db = await openCoverDb();
  const transaction = db.transaction(['info', 'images'], 'readwrite');
  const taken: StoredCoverRecord[] = [];
  for (const id of bookmarkIds) {
    const info = await transaction.objectStore('info').get(id);
    const image = await transaction.objectStore('images').get(id);
    if (!info || !image) continue;
    taken.push({ info, image });
    await transaction.objectStore('info').delete(id);
    await transaction.objectStore('images').delete(id);
  }
  await transaction.done;
  if (taken.length > 0) announceChange(taken.map(({ info }) => info.bookmarkId));
  return taken;
}

/**
 * Puts covers `takeCovers` removed back as they were (image, source, and date), except where a
 * bookmark has a cover again by now, which is newer and kept. Resolves to how many came back.
 */
export async function putBackCovers(records: readonly StoredCoverRecord[]): Promise<number> {
  if (records.length === 0) return 0;
  const db = await openCoverDb();
  const transaction = db.transaction(['info', 'images'], 'readwrite');
  const restored: string[] = [];
  for (const { info, image } of records) {
    if (await transaction.objectStore('info').get(info.bookmarkId)) continue;
    await transaction.objectStore('info').put(info);
    await transaction.objectStore('images').put(image);
    restored.push(info.bookmarkId);
  }
  await transaction.done;
  if (restored.length > 0) announceChange(restored);
  return restored.length;
}

/**
 * A stored cover in a form JSON can hold (its image in base64), to keep it outside IndexedDB for
 * a while: the cover a quick save replaced, which Remove cover puts back. Not strict about the
 * image's length here; the store that keeps it caps it.
 */
export const portableCoverSchema = z.strictObject({
  info: storedInfoSchema,
  type: z.string().startsWith('image/'),
  data: z.string(),
});
export type PortableCover = z.infer<typeof portableCoverSchema>;

/** `record` as a `PortableCover`. */
export function toPortableCover({ info, image }: StoredCoverRecord): PortableCover {
  return { info, type: image.type, data: bytesToBase64(new Uint8Array(image.data)) };
}

/** A `PortableCover` as the stored cover it was, for `putBackCovers`; undefined when unreadable. */
export function fromPortableCover(portable: PortableCover): StoredCoverRecord | undefined {
  try {
    const data = base64ToBytes(portable.data);
    if (data.byteLength !== portable.info.bytes) return undefined;
    return {
      info: portable.info,
      image: { bookmarkId: portable.info.bookmarkId, type: portable.type, data: data.buffer },
    };
  } catch {
    return undefined;
  }
}

/**
 * The stored covers of `bookmarkIds` exactly as kept, for `putBackCovers` later (Undo import);
 * ids without a cover are skipped. Nothing is removed.
 */
export async function copyCovers(bookmarkIds: readonly string[]): Promise<StoredCoverRecord[]> {
  const transaction = (await openCoverDb()).transaction(['info', 'images'], 'readonly');
  const copies: StoredCoverRecord[] = [];
  for (const id of bookmarkIds) {
    const info = await transaction.objectStore('info').get(id);
    const image = await transaction.objectStore('images').get(id);
    if (info && image) copies.push({ info, image });
  }
  await transaction.done;
  return copies;
}

/**
 * The stored covers of `bookmarkIds` as kept (info and image), for the backup file; ids without
 * a cover, or whose info does not parse, are skipped.
 */
export async function readCoverRecords(bookmarkIds: readonly string[]): Promise<CoverRecord[]> {
  const transaction = (await openCoverDb()).transaction(['info', 'images'], 'readonly');
  const records: CoverRecord[] = [];
  for (const id of bookmarkIds) {
    const info = coverInfoSchema.safeParse(await transaction.objectStore('info').get(id));
    const image = await transaction.objectStore('images').get(id);
    if (info.success && image) records.push({ info: info.data, image });
  }
  await transaction.done;
  return records;
}

/**
 * Stores covers from a backup as they were saved (source, date, and version), replacing each
 * bookmark's current one, then removes covers until all fit in `maxBytes`, as `saveCovers` does.
 * A cover saved before sources were recorded is written without one, as it was. `saved` counts
 * the covers kept, `notSaved` those left out because this device's storage is full.
 */
export async function restoreCoverRecords(
  records: readonly CoverRecord[],
  maxBytes: number,
): Promise<CoverSaveResult> {
  if (records.length === 0) return { saved: 0, notSaved: 0 };
  const db = await openCoverDb();
  const { written, notWritten } = await saveInBatches(records, (batch) => {
    const transaction = db.transaction(['info', 'images'], 'readwrite');
    return commitIndexedWrites(transaction, () =>
      batch.flatMap(({ info, image }) => [
        transaction.objectStore('info').put(toStoredInfo(info)),
        transaction.objectStore('images').put(image),
      ]),
    );
  });
  if (written === 0) return { saved: 0, notSaved: notWritten };
  const gone = await evictOverLimit(db, maxBytes);
  const stored = records.slice(0, written).map(({ info }) => info.bookmarkId);
  announceChange(new Set([...stored, ...gone]));
  return {
    saved: stored.filter((id) => !gone.has(id)).length,
    notSaved: notWritten,
  };
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
