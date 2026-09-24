/**
 * Subscribes to browser bookmark changes made anywhere (this page, other extension pages,
 * the browser UI, or sync) and calls back once per burst of events.
 */

import { useEffect, useRef } from 'react';

/** Bulk operations (imports, undo of a folder) fire many events; coalesce them into one refresh. */
const BOOKMARK_EVENT_DEBOUNCE_MS = 150;

type BookmarkEvent = {
  addListener: (callback: () => void) => void;
  removeListener: (callback: () => void) => void;
};

export function useBookmarkEvents(callback: () => void): void {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const api = browser.bookmarks as unknown as Record<string, BookmarkEvent | undefined>;
    if (!api) return;
    // onChildrenReordered and onImportEnded are Chrome-only; Firefox leaves them undefined.
    const events = [
      api.onCreated,
      api.onRemoved,
      api.onChanged,
      api.onMoved,
      api.onChildrenReordered,
      api.onImportEnded,
    ].filter((event): event is BookmarkEvent => Boolean(event?.addListener));

    let timer: ReturnType<typeof setTimeout> | undefined;
    const handleChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => callbackRef.current(), BOOKMARK_EVENT_DEBOUNCE_MS);
    };

    for (const event of events) event.addListener(handleChange);
    return () => {
      clearTimeout(timer);
      for (const event of events) event.removeListener(handleChange);
    };
  }, []);
}
