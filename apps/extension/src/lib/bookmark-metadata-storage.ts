export type StoredBookmarkMetadata = {
  tags?: string[];
  summary?: string;
};

export type StoredBookmarkMetadataById = Record<string, StoredBookmarkMetadata>;

// Stored raw; getStoredBookmarkMetadata validates entries on read.
const bookmarkMetadataStorageItem = storage.defineItem<unknown>(
  'local:bookmark-scout-bookmark-metadata',
);

export async function getStoredBookmarkMetadata(
  bookmarkIds: string[],
): Promise<StoredBookmarkMetadataById> {
  const stored = await bookmarkMetadataStorageItem.getValue();
  if (!isRecord(stored)) {
    return {};
  }

  const requestedIds = new Set(bookmarkIds);
  const metadata: StoredBookmarkMetadataById = {};

  for (const [bookmarkId, value] of Object.entries(stored)) {
    if (!requestedIds.has(bookmarkId) || !isRecord(value)) {
      continue;
    }

    const tags = Array.isArray(value.tags)
      ? value.tags
          .filter((tag): tag is string => typeof tag === 'string')
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];
    const summary = typeof value.summary === 'string' ? value.summary.trim() : '';

    if (tags.length > 0 || summary) {
      metadata[bookmarkId] = {
        ...(tags.length > 0 ? { tags } : {}),
        ...(summary ? { summary } : {}),
      };
    }
  }

  return metadata;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
