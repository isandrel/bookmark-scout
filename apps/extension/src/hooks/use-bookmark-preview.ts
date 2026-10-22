/**
 * The manager's bookmark preview (`BookmarkPreviewDialog`): the bookmark it shows and the rows its
 * Previous and Next step through, the table's page as shown when the preview opens. Closing it
 * after stepping makes the bookmark last shown the table's focused and selected row, as the arrow
 * keys would, so the keys pressed next (the preview key, Delete) act on that bookmark.
 */

import { type RefObject, useState } from 'react';

type PreviewState = {
  bookmark: Bookmark;
  rows: readonly Bookmark[];
  /** The bookmark the preview opened on; closing on it leaves the selection as it was. */
  openedId: string;
};

const NO_ROWS: readonly Bookmark[] = [];

export function useBookmarkPreview(table: RefObject<DataTableHandle<Bookmark> | null>) {
  const [state, setState] = useState<PreviewState | null>(null);
  return {
    bookmark: state?.bookmark ?? null,
    rows: state?.rows ?? NO_ROWS,
    open: (bookmark: Bookmark) =>
      setState({
        bookmark,
        rows: table.current?.getPageRows() ?? [bookmark],
        openedId: bookmark.id,
      }),
    /** Shows another bookmark of the same rows. */
    show: (bookmark: Bookmark) => setState((current) => current && { ...current, bookmark }),
    close: () => {
      if (state && state.bookmark.id !== state.openedId) {
        table.current?.selectRow(state.bookmark.id);
      }
      setState(null);
    },
  };
}
