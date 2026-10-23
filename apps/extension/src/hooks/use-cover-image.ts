/**
 * A bookmark's stored cover as an image address, read from this device only and read again after
 * its cover is saved or deleted on any page (`getCoverRevision`), not after another bookmark's. Each user holds one object URL (`showCoverImage`),
 * revoked when it unmounts or the cover changes, so a long list that mounts and unmounts rows
 * leaks none. Showing a cover never downloads anything.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

/** The cover of the bookmark at `url` as an object URL, or undefined without one (or loading). */
export function useCoverImage(bookmarkId: string, url: string | undefined): string | undefined {
  const changes = useSyncExternalStore(watchCovers, () => getCoverRevision(bookmarkId));
  // Which bookmark and address the image belongs to: one shown for another bookmark (a card or
  // preview moving on) is never handed out, since its URL is revoked as the next one loads.
  const key = `${bookmarkId} ${url ?? ''}`;
  const [shown, setShown] = useState<{ key: string; src?: string }>({ key: '' });

  // biome-ignore lint/correctness/useExhaustiveDependencies: `changes` reloads the cover after a save or delete.
  useEffect(() => {
    if (!url) {
      setShown({ key });
      return;
    }
    return showCoverImage(
      () => getCoverImage(bookmarkId, url),
      (src) => setShown({ key, src }),
    );
  }, [key, changes]);

  return shown.key === key ? shown.src : undefined;
}
