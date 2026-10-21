/**
 * Opening several bookmarks from the manager: in tabs, background tabs, or a new window, asking
 * first when that is more tabs than the Confirm Above setting (`openConfirmAbove`). Render
 * `BookmarkOpenDialog` (`components/bookmarks/`) with the result.
 */

import { useCallback, useState } from 'react';

export type BookmarkOpener = {
  /** Opens `urls`, or asks first when there are many. */
  open: (urls: readonly string[], target: BookmarkOpenTarget) => void;
  /** The opening waiting for confirmation, if any. */
  pending: { urls: readonly string[]; target: BookmarkOpenTarget } | null;
  confirm: () => void;
  cancel: () => void;
};

async function openNow(urls: readonly string[], target: BookmarkOpenTarget) {
  try {
    await openBookmarkUrls(urls, target);
  } catch (error) {
    toast.error({ title: t('bookmarks_openFailed'), description: getErrorMessage(error) });
  }
}

export function useBookmarkOpener(): BookmarkOpener {
  const [pending, setPending] = useState<BookmarkOpener['pending']>(null);
  const { value: confirmAbove } = useSetting('openConfirmAbove');

  const open = useCallback(
    (urls: readonly string[], target: BookmarkOpenTarget) => {
      if (urls.length === 0) return;
      if (urls.length > confirmAbove) {
        setPending({ urls, target });
        return;
      }
      void openNow(urls, target);
    },
    [confirmAbove],
  );

  const confirm = useCallback(() => {
    if (pending) void openNow(pending.urls, pending.target);
    setPending(null);
  }, [pending]);

  const cancel = useCallback(() => setPending(null), []);

  return { open, pending, confirm, cancel };
}
