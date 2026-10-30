/**
 * What a bookmark's stored cover is, for the places that show it with its details (the manager's
 * preview and the hover card): where it came from and when it was saved. Read from this device
 * only, and read again after its cover is saved or deleted on any page (`getCoverRevision`).
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

/** How each source is named, with the day the cover was saved as `$1`. */
const COVER_SOURCE_KEYS = {
  page: 'covers_sourcePage',
  tab: 'covers_sourceTab',
  browse: 'covers_sourceBrowse',
  quickSave: 'covers_sourceQuickSave',
} as const satisfies Record<CoverSource, MessageKey>;

/** The info of the bookmark's cover of `url`, or undefined while it has none (or it is loading). */
export function useCoverInfo(bookmarkId: string, url: string | undefined): CoverInfo | undefined {
  const changes = useSyncExternalStore(watchCovers, () => getCoverRevision(bookmarkId));
  const [info, setInfo] = useState<CoverInfo>();

  // biome-ignore lint/correctness/useExhaustiveDependencies: `changes` reads the info again after a save or delete.
  useEffect(() => {
    let stopped = false;
    const show = (next: CoverInfo | undefined) => {
      if (!stopped) setInfo(next);
    };
    if (url) {
      getCoverInfo(bookmarkId, url)
        .then(show)
        .catch(() => show(undefined));
    } else {
      show(undefined);
    }
    return () => {
      stopped = true;
    };
  }, [bookmarkId, url, changes]);

  return info;
}

/**
 * Where a cover came from and the day it was saved; undefined without a cover, or for one saved
 * before sources were recorded.
 */
export function describeCoverSource(info: CoverInfo | undefined): string | undefined {
  // A cover saved before sources were recorded shows no source line.
  if (!info || info.source === UNKNOWN_COVER_SOURCE) return undefined;
  return t(COVER_SOURCE_KEYS[info.source], formatDay(info.savedAt));
}

/** `describeCoverSource` for the bookmark's cover of `url`, following saves and deletes. */
export function useCoverSourceText(
  bookmarkId: string,
  url: string | undefined,
): string | undefined {
  return describeCoverSource(useCoverInfo(bookmarkId, url));
}

/**
 * The address each stored cover belongs to, by bookmark id, read again after any cover changes, so
 * menus can tell which bookmarks have a cover now (`hasStoredCover`).
 */
export function useCoveredBookmarks(): ReadonlyMap<string, string> {
  const changes = useSyncExternalStore(watchCovers, getCoverChangeCount);
  const [covered, setCovered] = useState<ReadonlyMap<string, string>>(new Map());

  // biome-ignore lint/correctness/useExhaustiveDependencies: `changes` reads the covers again after a save or delete.
  useEffect(() => {
    let stopped = false;
    getCoverInfos()
      .then((infos) => {
        if (stopped) return;
        setCovered(new Map([...infos.values()].map((info) => [info.bookmarkId, info.url])));
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
    };
  }, [changes]);

  return covered;
}

/** Whether `bookmark` has a stored cover for its current address, by `useCoveredBookmarks`. */
export function hasStoredCover(
  covered: ReadonlyMap<string, string>,
  bookmark: Pick<Bookmark, 'id' | 'url'>,
): boolean {
  return bookmark.url !== undefined && covered.get(bookmark.id) === bookmark.url;
}

/**
 * Removes the stored covers of `bookmarks` (their cards show the placeholder at once) and offers
 * Undo, which puts the same covers back (image, source, and date) unless a bookmark has a new one
 * by then. No confirmation: nothing but the cover is touched, and Undo restores it.
 */
export async function removeCoversWithUndo(
  bookmarks: readonly Pick<Bookmark, 'id'>[],
): Promise<void> {
  try {
    const taken = await takeCovers(bookmarks.map((bookmark) => bookmark.id));
    if (taken.length === 0) return;
    toast.withUndo({
      title: tPlural('covers_removed', taken.length, [String(taken.length)]),
      description: t('covers_removedDesc'),
      onUndo: async () => {
        try {
          await putBackCovers(taken);
        } catch (error) {
          toast.error({ title: t('covers_restoreFailed'), description: getErrorMessage(error) });
        }
      },
    });
  } catch (error) {
    toast.error({ title: t('covers_removeFailed'), description: getErrorMessage(error) });
  }
}
