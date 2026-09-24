export const BOOKMARK_METADATA_STORAGE_KEY = 'bookmark-scout-bookmark-metadata';

export type StoredBookmarkMetadata = {
  tags?: string[];
  summary?: string;
};

export type StoredBookmarkMetadataById = Record<string, StoredBookmarkMetadata>;

/** Entries are normalized on read, so malformed stored values are dropped. */
export const bookmarkMetadataItem = storage.defineItem<StoredBookmarkMetadataById>(
  `local:${BOOKMARK_METADATA_STORAGE_KEY}`,
);

export type BookmarkMetadataPatch = {
  tags?: string[];
  summary?: string;
};

export type BookmarkMetadataMergeOptions = {
  tagMode: 'append' | 'replace';
  summaryMode: 'append' | 'replace';
  dedupeTags: boolean;
};

// Read-modify-write updates of the shared record are serialized so concurrent callers in one
// page (for example an undo restore and a stale-ID cleanup) cannot overwrite each other.
let metadataWriteQueue: Promise<unknown> = Promise.resolve();

function withMetadataWriteLock<T>(task: () => Promise<T>): Promise<T> {
  const run = metadataWriteQueue.then(task, task);
  metadataWriteQueue = run.catch(() => undefined);
  return run;
}

export async function getStoredBookmarkMetadata(
  bookmarkIds: string[],
): Promise<StoredBookmarkMetadataById> {
  const stored = await readAllBookmarkMetadata();

  const requestedIds = new Set(bookmarkIds);
  const metadata: StoredBookmarkMetadataById = {};

  for (const [bookmarkId, value] of Object.entries(stored)) {
    if (!requestedIds.has(bookmarkId)) {
      continue;
    }
    metadata[bookmarkId] = value;
  }

  return metadata;
}

export async function saveBookmarkMetadata(
  bookmarkId: string,
  metadata: StoredBookmarkMetadata,
): Promise<void> {
  await mergeStoredBookmarkMetadata(
    { [bookmarkId]: { tags: metadata.tags ?? [], summary: metadata.summary ?? '' } },
    { tagMode: 'replace', summaryMode: 'replace', dedupeTags: true },
  );
}

export async function mergeStoredBookmarkMetadata(
  patches: Record<string, BookmarkMetadataPatch>,
  options: BookmarkMetadataMergeOptions,
): Promise<StoredBookmarkMetadataById> {
  return withMetadataWriteLock(() => mergeUnlocked(patches, options));
}

async function mergeUnlocked(
  patches: Record<string, BookmarkMetadataPatch>,
  options: BookmarkMetadataMergeOptions,
): Promise<StoredBookmarkMetadataById> {
  const stored = await readAllBookmarkMetadata();

  for (const [bookmarkId, patch] of Object.entries(patches)) {
    const current = stored[bookmarkId] ?? {};
    const tags = patch.tags === undefined
      ? current.tags ?? []
      : mergeTags(current.tags ?? [], patch.tags, options.tagMode, options.dedupeTags);
    const summary = patch.summary === undefined
      ? current.summary ?? ''
      : mergeSummary(current.summary ?? '', patch.summary, options.summaryMode);
    const normalized = normalizeMetadata({ tags, summary });

    if (normalized) {
      stored[bookmarkId] = normalized;
    } else {
      delete stored[bookmarkId];
    }
  }

  await writeAllBookmarkMetadata(stored);
  return stored;
}

export async function removeStoredBookmarkMetadata(bookmarkIds: string[]): Promise<void> {
  return withMetadataWriteLock(() => removeUnlocked(bookmarkIds));
}

async function removeUnlocked(bookmarkIds: string[]): Promise<void> {
  const stored = await readAllBookmarkMetadata();
  let changed = false;

  for (const bookmarkId of bookmarkIds) {
    if (bookmarkId in stored) {
      delete stored[bookmarkId];
      changed = true;
    }
  }

  if (changed) {
    await writeAllBookmarkMetadata(stored);
  }
}

export async function reconcileStoredBookmarkMetadata(validBookmarkIds: string[]): Promise<void> {
  return withMetadataWriteLock(() => reconcileUnlocked(validBookmarkIds));
}

async function reconcileUnlocked(validBookmarkIds: string[]): Promise<void> {
  const validIds = new Set(validBookmarkIds);
  const stored = await readAllBookmarkMetadata();
  const staleIds = Object.keys(stored).filter((bookmarkId) => !validIds.has(bookmarkId));

  if (staleIds.length > 0) {
    for (const bookmarkId of staleIds) {
      delete stored[bookmarkId];
    }
    await writeAllBookmarkMetadata(stored);
  }
}

async function readAllBookmarkMetadata(): Promise<StoredBookmarkMetadataById> {
  const raw: unknown = await bookmarkMetadataItem.getValue();
  if (!isRecord(raw)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(raw).flatMap(([bookmarkId, value]) => {
      if (!isRecord(value)) {
        return [];
      }
      const normalized = normalizeMetadata(value);
      return normalized ? [[bookmarkId, normalized]] : [];
    }),
  );
}

async function writeAllBookmarkMetadata(metadata: StoredBookmarkMetadataById): Promise<void> {
  if (Object.keys(metadata).length === 0) {
    await bookmarkMetadataItem.removeValue();
    return;
  }
  await bookmarkMetadataItem.setValue(metadata);
}

function normalizeMetadata(value: Record<string, unknown>): StoredBookmarkMetadata | null {
  const tags = Array.isArray(value.tags)
    ? value.tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];
  const summary = typeof value.summary === 'string' ? value.summary.trim() : '';

  if (tags.length === 0 && !summary) {
    return null;
  }
  return {
    ...(tags.length > 0 ? { tags } : {}),
    ...(summary ? { summary } : {}),
  };
}

function mergeTags(
  currentTags: string[],
  nextTags: string[],
  mode: 'append' | 'replace',
  dedupe: boolean,
) {
  const merged = (mode === 'append' ? [...currentTags, ...nextTags] : nextTags)
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (!dedupe) {
    return merged;
  }

  const seen = new Set<string>();
  return merged.filter((tag) => {
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function mergeSummary(currentSummary: string, nextSummary: string, mode: 'append' | 'replace') {
  const current = currentSummary.trim();
  const next = nextSummary.trim();
  if (mode === 'replace' || !current) {
    return next;
  }
  return next ? `${current}\n\n${next}` : current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
