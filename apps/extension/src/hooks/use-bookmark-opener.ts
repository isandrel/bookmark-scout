/**
 * Opening several bookmarks from the manager: in tabs, background tabs, or a new window, asking
 * first when that is more tabs than `config/bookmarks/open.toml` allows without asking. Render
 * `BookmarkOpenDialog` (`components/bookmarks/`) with the result.
 */

import { useCallback, useState } from 'react';
import { z } from 'zod';

const openConfig = readConfig(
  'bookmarks/open',
  z.strictObject({ confirm_above: z.number().int().positive() }),
);

/** More tabs than this asks first. */
export const OPEN_CONFIRMATION_LIMIT = openConfig.confirm_above;

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

  const open = useCallback((urls: readonly string[], target: BookmarkOpenTarget) => {
    if (urls.length === 0) return;
    if (urls.length > OPEN_CONFIRMATION_LIMIT) {
      setPending({ urls, target });
      return;
    }
    void openNow(urls, target);
  }, []);

  const confirm = useCallback(() => {
    if (pending) void openNow(pending.urls, pending.target);
    setPending(null);
  }, [pending]);

  const cancel = useCallback(() => setPending(null), []);

  return { open, pending, confirm, cancel };
}
