/**
 * What a bookmark's stored cover is, for the places that show it with its details (the manager's
 * preview and the hover card): where it came from and when it was saved. Read from this device
 * only, and read again after any cover is saved or deleted on any page.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

/** How each source is named, with the day the cover was saved as `$1`. */
const COVER_SOURCE_KEYS = {
  page: 'covers_sourcePage',
  tab: 'covers_sourceTab',
  browse: 'covers_sourceBrowse',
} as const satisfies Record<CoverSource, MessageKey>;

/** The info of the bookmark's cover of `url`, or undefined while it has none (or it is loading). */
export function useCoverInfo(bookmarkId: string, url: string | undefined): CoverInfo | undefined {
  const changes = useSyncExternalStore(watchCovers, getCoverChangeCount);
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

/** Where the bookmark's cover came from and the day it was saved, or undefined without one. */
export function useCoverSourceText(
  bookmarkId: string,
  url: string | undefined,
): string | undefined {
  const info = useCoverInfo(bookmarkId, url);
  return info ? t(COVER_SOURCE_KEYS[info.source], formatDay(info.savedAt)) : undefined;
}
