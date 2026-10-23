export type StoredBookmarkMetadata = {
  tags?: string[];
  summary?: string;
};

export type StoredBookmarkMetadataById = Record<string, StoredBookmarkMetadata>;

export type BookmarkMetadataPatch = {
  tags?: string[];
  summary?: string;
};

/**
 * Characters that separate typed tags: the ASCII comma, plus the ideographic, full-width, and
 * half-width ideographic commas that Japanese, Chinese, and Korean keyboards produce.
 */
export const TAG_SEPARATOR_PATTERN = /[,、，､]/;

/** Splits typed tags at any comma, trimmed, without blanks or repeats, in typed order. */
export function parseBookmarkTags(text: string): string[] {
  return [
    ...new Set(
      text
        .split(TAG_SEPARATOR_PATTERN)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}

/** What two spellings of one tag share: Unicode-normalized (NFKC), trimmed, and lowercased. */
export function tagKey(tag: string): string {
  return tag.normalize('NFKC').trim().toLowerCase();
}

/**
 * Every tag in use, most used first (then in alphabetical order), each in the spelling most
 * bookmarks use, so "React" and "react" count as one tag.
 */
export function getTagVocabulary(metadata: StoredBookmarkMetadataById): string[] {
  const tags = new Map<string, { count: number; spellings: Map<string, number> }>();
  for (const entry of Object.values(metadata)) {
    const seen = new Set<string>();
    for (const spelling of entry.tags ?? []) {
      const key = tagKey(spelling);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const tag = tags.get(key) ?? { count: 0, spellings: new Map() };
      tag.count += 1;
      tag.spellings.set(spelling.trim(), (tag.spellings.get(spelling.trim()) ?? 0) + 1);
      tags.set(key, tag);
    }
  }
  return [...tags.values()]
    .map(({ count, spellings }) => ({
      count,
      spelling: [...spellings].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
    }))
    .sort((a, b) => b.count - a.count || a.spelling.localeCompare(b.spelling))
    .map(({ spelling }) => spelling);
}

/**
 * `tags` with each one that matches a tag in `vocabulary` apart from case, width, or spacing
 * written as the vocabulary spells it, so a suggestion never adds a near-duplicate of a tag in use.
 */
export function matchTagSpellings(
  tags: readonly string[],
  vocabulary: readonly string[],
): string[] {
  const spellings = new Map(vocabulary.map((tag) => [tagKey(tag), tag]));
  return tags.map((tag) => spellings.get(tagKey(tag)) ?? tag);
}

export type BookmarkMetadataMergeOptions = {
  tagMode: 'append' | 'replace';
  summaryMode: 'append' | 'replace';
  dedupeTags: boolean;
};

/**
 * Tags and summaries by bookmark id. Entries are normalized on read, so malformed stored values
 * are dropped, and the key is removed once no bookmark has any. Updates are queued, so concurrent
 * callers in one page (for example an undo restore and a stale-ID cleanup) never overwrite each
 * other.
 */
export const bookmarkMetadataValue = defineStoredValue<StoredBookmarkMetadataById>(
  STORAGE_ITEMS.bookmarkMetadata,
  {
    parse: parseBookmarkMetadata,
    empty: {},
    isEmpty: (metadata) => Object.keys(metadata).length === 0,
  },
);

export async function getStoredBookmarkMetadata(
  bookmarkIds: string[],
): Promise<StoredBookmarkMetadataById> {
  const stored = await bookmarkMetadataValue.get();
  const requestedIds = new Set(bookmarkIds);
  return Object.fromEntries(Object.entries(stored).filter(([id]) => requestedIds.has(id)));
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

/** `current` with each patch merged in; an entry left without tags or summary is removed. */
function applyMetadataPatches(
  current: StoredBookmarkMetadataById,
  patches: Record<string, BookmarkMetadataPatch>,
  options: BookmarkMetadataMergeOptions,
): StoredBookmarkMetadataById {
  const stored = { ...current };
  for (const [bookmarkId, patch] of Object.entries(patches)) {
    const existing = stored[bookmarkId] ?? {};
    const tags =
      patch.tags === undefined
        ? (existing.tags ?? [])
        : mergeTags(existing.tags ?? [], patch.tags, options.tagMode, options.dedupeTags);
    const summary =
      patch.summary === undefined
        ? (existing.summary ?? '')
        : mergeSummary(existing.summary ?? '', patch.summary, options.summaryMode);
    const normalized = normalizeMetadata({ tags, summary });
    if (normalized) {
      stored[bookmarkId] = normalized;
    } else {
      delete stored[bookmarkId];
    }
  }
  return stored;
}

export function mergeStoredBookmarkMetadata(
  patches: Record<string, BookmarkMetadataPatch>,
  options: BookmarkMetadataMergeOptions,
): Promise<StoredBookmarkMetadataById> {
  return bookmarkMetadataValue.update((current) => applyMetadataPatches(current, patches, options));
}

/** What reverting saved tags and summaries did. */
export type BookmarkMetadataUndoResult = { restored: number; failed: number };

/**
 * `mergeStoredBookmarkMetadata` that can be reverted once: `undo` puts back each bookmark's tags
 * and summary as they were, but only while they are still what this merge wrote, so it never
 * overwrites a newer edit (that bookmark counts as failed). A later call returns the first
 * call's result.
 */
export async function mergeStoredBookmarkMetadataWithUndo(
  patches: Record<string, BookmarkMetadataPatch>,
  options: BookmarkMetadataMergeOptions,
): Promise<{ undo: () => Promise<BookmarkMetadataUndoResult> }> {
  const ids = Object.keys(patches);
  let before: StoredBookmarkMetadataById = {};
  const after = await bookmarkMetadataValue.update((current) => {
    before = current;
    return applyMetadataPatches(current, patches, options);
  });
  let undone: Promise<BookmarkMetadataUndoResult> | undefined;
  const undo = () => {
    undone ??= (async () => {
      let result: BookmarkMetadataUndoResult = { restored: 0, failed: 0 };
      await bookmarkMetadataValue.update((current) => {
        result = { restored: 0, failed: 0 };
        const restored = { ...current };
        for (const id of ids) {
          if (!isSameJson(current[id], after[id])) {
            result.failed += 1;
            continue;
          }
          if (before[id]) restored[id] = before[id];
          else delete restored[id];
          result.restored += 1;
        }
        return restored;
      });
      return result;
    })();
    return undone;
  };
  return { undo };
}

export async function removeStoredBookmarkMetadata(bookmarkIds: string[]): Promise<void> {
  const removed = new Set(bookmarkIds);
  await bookmarkMetadataValue.update((current) =>
    Object.fromEntries(Object.entries(current).filter(([id]) => !removed.has(id))),
  );
}

export async function reconcileStoredBookmarkMetadata(validBookmarkIds: string[]): Promise<void> {
  const validIds = new Set(validBookmarkIds);
  await bookmarkMetadataValue.update((current) =>
    Object.fromEntries(Object.entries(current).filter(([id]) => validIds.has(id))),
  );
}

/**
 * Valid tags and summaries by key (a bookmark id in storage, a URL in a JSON export); malformed
 * entries and empty ones are dropped.
 */
export function parseBookmarkMetadata(raw: unknown): StoredBookmarkMetadataById {
  if (!isPlainObject(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).flatMap(([bookmarkId, value]) => {
      const normalized = isPlainObject(value) ? normalizeMetadata(value) : null;
      return normalized ? [[bookmarkId, normalized]] : [];
    }),
  );
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
