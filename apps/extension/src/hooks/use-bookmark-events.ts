/**
 * Subscribe to browser bookmark changes made anywhere: other extension pages, the browser's own
 * bookmark UI, or sync. Bursts of events (imports, folder deletes, undo restores) are coalesced
 * into one callback.
 */

import { useEffect, useRef } from 'react';

const BOOKMARK_EVENT_DEBOUNCE_MS = 150;

type BookmarkEvent = {
  addListener: (callback: () => void) => void;
  removeListener: (callback: () => void) => void;
};

export function useBookmarkEvents(callback: () => void): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const api = browser.bookmarks;
    if (!api) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => callbackRef.current(), BOOKMARK_EVENT_DEBOUNCE_MS);
    };

    // onChildrenReordered is Chrome-only; Firefox leaves it undefined.
    const events = [
      api.onCreated,
      api.onRemoved,
      api.onChanged,
      api.onMoved,
      (api as { onChildrenReordered?: BookmarkEvent }).onChildrenReordered,
    ].filter((event): event is NonNullable<typeof event> => event !== undefined) as BookmarkEvent[];

    for (const event of events) event.addListener(schedule);
    return () => {
      clearTimeout(timer);
      for (const event of events) event.removeListener(schedule);
    };
  }, []);
}
