/**
 * A bookmark's stored cover at the top of its card in the manager (Fetch Covers), read from this
 * device only. Showing a card never downloads anything: without a stored cover for the
 * bookmark's current address, nothing is drawn and the card keeps its site icon.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

export function BookmarkCover({ bookmarkId, url }: { bookmarkId: string; url: string }) {
  const changes = useSyncExternalStore(watchCovers, getCoverChangeCount);
  const [src, setSrc] = useState<string>();

  // biome-ignore lint/correctness/useExhaustiveDependencies: `changes` reloads the cover after a save or delete.
  useEffect(() => {
    let objectUrl: string | undefined;
    let cancelled = false;
    getCoverImage(bookmarkId, url)
      .then((image) => {
        if (cancelled) return;
        objectUrl = image ? URL.createObjectURL(image) : undefined;
        setSrc(objectUrl);
      })
      .catch(() => setSrc(undefined));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [bookmarkId, url, changes]);

  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      decoding="async"
      data-testid="bookmark-cover"
      className="aspect-[1.91/1] w-full rounded-md border object-cover"
    />
  );
}
