/**
 * Covers in the backup file, so they reach a new computer: covers stay on the device that made
 * them (`lib/cover-store.ts`) and never sync. Back up settings writes, when Include covers is
 * checked, one cover per address with its image in base64, where it came from, when it was saved,
 * and its size (`covers` in the file, `backup.ts`). Bookmark ids differ on another computer, so a
 * cover is keyed by its bookmark's address, compared the way the browser parses addresses
 * (`safeNormalizeUrl`), and stored there under each bookmark of that address as that bookmark
 * spells it, since the cover store matches addresses exactly.
 *
 * A restore never replaces a cover the user picked (Use this view as the cover, `isKeptCover`)
 * unless the file's cover was also picked and is newer; any other cover is replaced only by a
 * newer one, so restoring a backup onto the device that made it changes nothing. The file comes
 * from outside: each entry is checked on its own against `config/bookmarks/cover-backup.toml`'s
 * caps and the cover checks (`config/bookmarks/covers.toml`: type by its first bytes, the size its
 * header states, and the decoded size), and one that fails is left out alone. Cover Storage
 * still applies after a restore, removing the oldest covers first.
 */
import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';

const coverBackupConfig = readConfig(
  'bookmarks/cover-backup',
  z.strictObject({
    max_covers: boundedNumber({ integer: true }),
    max_image_kb: boundedNumber({ integer: true }),
    max_total_mb: boundedNumber({ integer: true }),
  }),
);

export const COVER_BACKUP_LIMITS = {
  maxCovers: coverBackupConfig.max_covers,
  maxImageBytes: coverBackupConfig.max_image_kb * BYTES_PER_KB,
  maxTotalBytes: coverBackupConfig.max_total_mb * BYTES_PER_MB,
} as const;

const BACKUP_COVER_SOURCES = [...COVER_SOURCES, UNKNOWN_COVER_SOURCE] as const;

/**
 * One cover in the file. Not strict, so a file from a newer release with more fields still reads.
 * `bytes` is the image's size; `data` the image, in base64.
 */
const backupCoverSchema = z.object({
  url: z.string().min(1),
  source: z.enum(BACKUP_COVER_SOURCES),
  savedAt: z.iso.datetime(),
  version: z.number().int().positive(),
  type: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().positive().max(COVER_BACKUP_LIMITS.maxImageBytes),
  data: z.string().max(base64Length(COVER_BACKUP_LIMITS.maxImageBytes)),
});
export type BackupCoverEntry = z.infer<typeof backupCoverSchema>;

/** A cover read from a backup file and checked, ready to store. */
export type BackupCover = {
  url: string;
  /** The address as covers are matched (`coverUrlKey`). */
  key: string;
  source: StoredCoverSource;
  savedAt: number;
  version: number;
  type: string;
  width: number;
  height: number;
  data: Uint8Array<ArrayBuffer>;
};

/**
 * The covers a file holds: one per address, and how many entries were left out (unreadable,
 * failing a check, past a cap, or a second entry for an address).
 */
export type BackupCovers = { inFile: number; covers: BackupCover[]; skipped: number };

/** An address as covers in a backup are matched: as the browser parses it, else trimmed. */
export function coverUrlKey(url: string): string {
  const trimmed = url.trim();
  return safeNormalizeUrl(trimmed) ?? trimmed;
}

type CoverStanding = { source: StoredCoverSource; savedAt: number };

/** Whether `next` is the better of two covers of one address: a picked one, else the newer. */
function isBetterCover(next: CoverStanding, current: CoverStanding): boolean {
  const nextKept = isKeptCover(next.source);
  if (nextKept !== isKeptCover(current.source)) return nextKept;
  return next.savedAt > current.savedAt;
}

/**
 * Whether a cover from a backup replaces the cover a bookmark has: a picked cover only by another
 * picked one that is newer; any other cover by a newer one.
 */
export function importedCoverWins(imported: CoverStanding, existing: CoverStanding): boolean {
  if (isKeptCover(existing.source) && !isKeptCover(imported.source)) return false;
  return imported.savedAt > existing.savedAt;
}

/** A file entry as a cover to store, or undefined when it fails a check. */
function readBackupCover(raw: unknown): BackupCover | undefined {
  const entry = backupCoverSchema.safeParse(raw);
  if (!entry.success) return undefined;
  let data: Uint8Array<ArrayBuffer>;
  try {
    data = base64ToBytes(entry.data.data);
  } catch {
    return undefined;
  }
  const file = readCoverFile(data);
  if (
    data.byteLength !== entry.data.bytes ||
    file?.type !== entry.data.type ||
    file.width !== entry.data.width ||
    file.height !== entry.data.height
  ) {
    return undefined;
  }
  return {
    url: entry.data.url,
    key: coverUrlKey(entry.data.url),
    source: entry.data.source,
    savedAt: Date.parse(entry.data.savedAt),
    version: entry.data.version,
    type: file.type,
    width: file.width,
    height: file.height,
    data,
  };
}

/**
 * Reads a file's `covers` section entry by entry: one that fails a check is left out alone, and
 * so is every entry past `max_covers` or past `max_total_mb` in all. Two entries for one address
 * keep the better (`isBetterCover`).
 */
export function readBackupCovers(raw: readonly unknown[]): BackupCovers {
  const byKey = new Map<string, BackupCover>();
  let accepted = 0;
  let totalBytes = 0;
  for (const entry of raw) {
    if (accepted >= COVER_BACKUP_LIMITS.maxCovers) break;
    const cover = readBackupCover(entry);
    if (!cover || totalBytes + cover.data.byteLength > COVER_BACKUP_LIMITS.maxTotalBytes) continue;
    accepted += 1;
    totalBytes += cover.data.byteLength;
    const current = byKey.get(cover.key);
    if (!current || isBetterCover(cover, current)) byKey.set(cover.key, cover);
  }
  const covers = [...byKey.values()];
  return { inFile: raw.length, covers, skipped: raw.length - covers.length };
}

/** A bookmark's id and address, and the address as covers are matched. */
export type BookmarkAddress = { id: string; url: string; key: string };

async function listBookmarkAddresses(): Promise<BookmarkAddress[]> {
  return flattenBookmarks(await fetchBookmarkTree()).flatMap(({ node, normalizedUrl }) =>
    node.url ? [{ id: node.id, url: node.url, key: normalizedUrl ?? node.url.trim() }] : [],
  );
}

/** The covers a backup writes, newest first, and how many shown covers did not fit its caps. */
export type BackupCoverSelection = { selected: CoverInfo[]; leftOut: number };

/**
 * The covers a backup holds: of each address, the cover its bookmarks show (a cover of the
 * bookmark's current address), the picked one if any, else the newest; newest first, within
 * `max_covers`, `max_image_kb`, and `max_total_mb`. `leftOut` counts addresses past a cap.
 */
export function selectBackupCovers(
  infos: Iterable<CoverInfo>,
  bookmarks: readonly BookmarkAddress[],
): BackupCoverSelection {
  const byId = new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));
  const byKey = new Map<string, CoverInfo>();
  for (const info of infos) {
    const bookmark = byId.get(info.bookmarkId);
    if (bookmark?.url !== info.url) continue;
    const current = byKey.get(bookmark.key);
    if (!current || isBetterCover(info, current)) byKey.set(bookmark.key, info);
  }
  const selected: CoverInfo[] = [];
  let totalBytes = 0;
  let leftOut = 0;
  for (const info of [...byKey.values()].sort((a, b) => b.savedAt - a.savedAt)) {
    const fits =
      selected.length < COVER_BACKUP_LIMITS.maxCovers &&
      info.bytes <= COVER_BACKUP_LIMITS.maxImageBytes &&
      totalBytes + info.bytes <= COVER_BACKUP_LIMITS.maxTotalBytes;
    if (!fits) {
      leftOut += 1;
      continue;
    }
    selected.push(info);
    totalBytes += info.bytes;
  }
  return { selected, leftOut };
}

function toBackupEntry(info: CoverInfo, type: string, data: string): BackupCoverEntry {
  return {
    url: info.url,
    source: info.source,
    savedAt: new Date(info.savedAt).toISOString(),
    version: info.version,
    type,
    width: info.width,
    height: info.height,
    bytes: info.bytes,
    data,
  };
}

/** What Include covers adds to a backup: how many covers, about how many bytes, and left out. */
export type CoverBackupEstimate = { covers: number; fileBytes: number; leftOut: number };

/**
 * How many covers a backup would hold and about how much they add to the file (their images in
 * base64 and each entry's fields), read from the covers' info without reading an image.
 */
export async function estimateCoverBackup(): Promise<CoverBackupEstimate> {
  const { selected, leftOut } = selectBackupCovers(
    (await getCoverInfos()).values(),
    await listBookmarkAddresses(),
  );
  let fileBytes = 0;
  for (const info of selected) {
    fileBytes +=
      JSON.stringify(toBackupEntry(info, COVER_LIMITS.outputType, '')).length +
      base64Length(info.bytes);
  }
  return { covers: selected.length, fileBytes, leftOut };
}

/** The covers section of a backup (`selectBackupCovers`), each image read and written in base64. */
export async function exportBackupCovers(): Promise<BackupCoverEntry[]> {
  const { selected } = selectBackupCovers(
    (await getCoverInfos()).values(),
    await listBookmarkAddresses(),
  );
  const records = await readCoverRecords(selected.map((info) => info.bookmarkId));
  return records.map(({ info, image }) =>
    toBackupEntry(
      { ...info, bytes: image.data.byteLength },
      image.type,
      bytesToBase64(new Uint8Array(image.data)),
    ),
  );
}

/** A cover a restore writes: the bookmark, its own spelling of the address, and the cover. */
export type CoverRestoreWrite = { bookmarkId: string; url: string; cover: BackupCover };

/**
 * What restoring a file's covers would do, for the review: `matched` and `unmatched` count the
 * file's covers with and without a bookmark of their address here; `added`, `replaced`, and
 * `kept` count bookmarks (an address can have several); `overStorage` counts covers that would
 * not fit in Cover Storage afterwards (the oldest, this device's or the file's).
 */
export type CoverRestorePlan = {
  inFile: number;
  skipped: number;
  matched: number;
  unmatched: number;
  added: number;
  replaced: number;
  kept: number;
  overStorage: number;
  writes: CoverRestoreWrite[];
};

/**
 * Plans a restore of `file`'s covers onto `bookmarks`, given the covers stored now. A bookmark's
 * cover of another address is not shown, so it counts as none and is replaced.
 */
export function planCoverRestore(
  file: BackupCovers,
  bookmarks: readonly BookmarkAddress[],
  stored: ReadonlyMap<string, CoverInfo>,
  maxCacheBytes: number,
): CoverRestorePlan {
  const byKey = new Map<string, BookmarkAddress[]>();
  for (const bookmark of bookmarks) {
    byKey.set(bookmark.key, [...(byKey.get(bookmark.key) ?? []), bookmark]);
  }
  const plan: CoverRestorePlan = {
    inFile: file.inFile,
    skipped: file.skipped,
    matched: 0,
    unmatched: 0,
    added: 0,
    replaced: 0,
    kept: 0,
    overStorage: 0,
    writes: [],
  };
  for (const cover of file.covers) {
    const targets = byKey.get(cover.key) ?? [];
    if (targets.length === 0) {
      plan.unmatched += 1;
      continue;
    }
    plan.matched += 1;
    for (const target of targets) {
      const existing = stored.get(target.id);
      const shown = existing?.url === target.url ? existing : undefined;
      if (shown && !importedCoverWins(cover, shown)) {
        plan.kept += 1;
        continue;
      }
      if (shown) plan.replaced += 1;
      else plan.added += 1;
      plan.writes.push({ bookmarkId: target.id, url: target.url, cover });
    }
  }
  const written = new Set(plan.writes.map((write) => write.bookmarkId));
  plan.overStorage = coversOverLimit(
    [
      ...[...stored.values()].filter((info) => !written.has(info.bookmarkId)),
      ...plan.writes.map(({ bookmarkId, cover }) => ({
        bookmarkId,
        bytes: cover.data.byteLength,
        savedAt: cover.savedAt,
      })),
    ],
    maxCacheBytes,
  ).size;
  return plan;
}

async function coverStorageBytes(): Promise<number> {
  return (await getSettings()).coversMaxCacheMb * BYTES_PER_MB;
}

/** The review of restoring `file`'s covers on this device now (`planCoverRestore`). */
export async function previewCoverRestore(file: BackupCovers): Promise<CoverRestorePlan> {
  return planCoverRestore(
    file,
    await listBookmarkAddresses(),
    await getCoverInfos(),
    await coverStorageBytes(),
  );
}

/**
 * What a restore did: covers stored (`restored`, by bookmark), covers that did not fit in Cover
 * Storage or this device's storage (`notStored`), bookmarks that kept their own (`kept`), the
 * file's covers with no bookmark here (`unmatched`), and entries left out (`skipped`, including
 * images the browser could not decode).
 */
export type CoverRestoreOutcome = {
  restored: number;
  notStored: number;
  kept: number;
  unmatched: number;
  skipped: number;
};

/**
 * Restores `file`'s covers, planned again against the bookmarks and covers stored now (a restore
 * of settings just before may have changed Cover Storage), after decoding each image once. There
 * is no undo, as for the rest of a backup restore.
 */
export async function applyCoverRestore(file: BackupCovers): Promise<CoverRestoreOutcome> {
  const maxCacheBytes = await coverStorageBytes();
  const plan = planCoverRestore(
    file,
    await listBookmarkAddresses(),
    await getCoverInfos(),
    maxCacheBytes,
  );
  const covers = [...new Set(plan.writes.map((write) => write.cover))];
  const decodes = await mapWithConcurrency(covers, COVER_LIMITS.concurrency, (cover) =>
    decodesAsCover(cover.data, cover.type),
  );
  const unreadable = new Set(covers.filter((_, index) => !decodes[index]));
  const writes = plan.writes.filter((write) => !unreadable.has(write.cover));
  const { saved } = await restoreCoverRecords(
    writes.map(({ bookmarkId, url, cover }) => ({
      info: {
        bookmarkId,
        url,
        width: cover.width,
        height: cover.height,
        bytes: cover.data.byteLength,
        savedAt: cover.savedAt,
        version: cover.version,
        source: cover.source,
      },
      image: { bookmarkId, type: cover.type, data: cover.data.buffer },
    })),
    maxCacheBytes,
  );
  return {
    restored: saved,
    notStored: writes.length - saved,
    kept: plan.kept,
    unmatched: plan.unmatched,
    skipped: plan.skipped + unreadable.size,
  };
}
