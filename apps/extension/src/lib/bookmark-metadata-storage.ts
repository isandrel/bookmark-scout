export const BOOKMARK_METADATA_STORAGE_KEY = 'bookmark-scout-bookmark-metadata';

export type StoredBookmarkMetadata = {
  tags?: string[];
  summary?: string;
};

export type StoredBookmarkMetadataById = Record<string, StoredBookmarkMetadata>;

export async function getStoredBookmarkMetadata(
  bookmarkIds: string[],
): Promise<StoredBookmarkMetadataById> {
  const result = await browser.storage.local.get(BOOKMARK_METADATA_STORAGE_KEY);
  const stored = result?.[BOOKMARK_METADATA_STORAGE_KEY];
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
