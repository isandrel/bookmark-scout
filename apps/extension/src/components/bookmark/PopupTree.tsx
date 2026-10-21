/**
 * The popup and side panel bookmark tree. It renders only the rows on screen, from the flat list
 * `flattenVisibleTree` builds, so expanding every folder or scrolling a library of thousands of
 * bookmarks costs the same as a small one. Rows follow the ARIA tree pattern (`treeitem` with
 * level, position, and size), since rows off screen are not in the page.
 *
 * Keyboard navigation goes through `PopupTreeHandle`, which reaches rows that are not rendered.
 */

import { defaultRangeExtractor, type Range, useVirtualizer } from '@tanstack/react-virtual';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';

const treeConfig = readConfig(
  'ui/popup-tree-view',
  z.strictObject({
    row_height_px: z.number().int().positive(),
    overscan_rows: z.number().int().nonnegative(),
    padding_px: z.number().int().nonnegative(),
    indent_px: z.number().int().nonnegative(),
  }),
);

/** Moves focus through rows by id, rendered or not. */
export type PopupTreeHandle = {
  /** Scrolls the row into view and focuses it once it is rendered. */
  focusRow: (id: string) => void;
  /** The row `offset` rows away from `id`, in display order; undefined past either end. */
  rowIdAt: (id: string, offset: number) => string | undefined;
  firstRowId: () => string | undefined;
  lastRowId: () => string | undefined;
  /** The folder the row is in, if it is not at the top level. */
  parentIdOf: (id: string) => string | undefined;
};

/** Marks every rendered row's focusable element with its node id. */
export const POPUP_TREE_ROW_ID_ATTRIBUTE = 'data-tree-row-id';

type PopupTreeProps = {
  roots: readonly BookmarkTreeNode[];
  expandedIds: readonly string[];
  setFolderExpanded: (folderId: string, expanded: boolean) => void;
  /** The element that scrolls the tree. */
  scrollRef: RefObject<HTMLElement | null>;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  handleRef: Ref<PopupTreeHandle>;
};

export function PopupTree({
  roots,
  expandedIds,
  setFolderExpanded,
  scrollRef,
  onKeyDown,
  handleRef,
}: PopupTreeProps) {
  const expanded = useMemo(() => new Set(expandedIds), [expandedIds]);
  const rows = useMemo(() => flattenVisibleTree(roots, expanded), [roots, expanded]);
  const indexById = useMemo(() => new Map(rows.map((row, index) => [row.node.id, index])), [rows]);

  // The focused row stays rendered while it scrolls out of view, so focus is never lost.
  const focusedIndexRef = useRef<number | null>(null);
  const rangeExtractor = useCallback((range: Range) => {
    const indexes = defaultRangeExtractor(range);
    const focused = focusedIndexRef.current;
    if (focused === null || focused >= range.count || indexes.includes(focused)) return indexes;
    return [...indexes, focused].sort((a, b) => a - b);
  }, []);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => treeConfig.row_height_px,
    overscan: treeConfig.overscan_rows,
    paddingStart: treeConfig.padding_px,
    paddingEnd: treeConfig.padding_px,
    getItemKey: (index) => rows[index].node.id,
    rangeExtractor,
  });

  const treeRef = useRef<HTMLDivElement>(null);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  // Focus a row asked for by the keyboard once the virtualizer has rendered it.
  useEffect(() => {
    if (pendingFocusId === null) return;
    const element = treeRef.current?.querySelector<HTMLElement>(
      `[${POPUP_TREE_ROW_ID_ATTRIBUTE}="${CSS.escape(pendingFocusId)}"]`,
    );
    if (!element) return;
    element.focus();
    setPendingFocusId(null);
  });

  useImperativeHandle(
    handleRef,
    () => ({
      focusRow: (id) => {
        const index = indexById.get(id);
        if (index === undefined) return;
        focusedIndexRef.current = index;
        virtualizer.scrollToIndex(index, { align: 'auto' });
        setPendingFocusId(id);
      },
      rowIdAt: (id, offset) => {
        const index = indexById.get(id);
        return index === undefined ? undefined : rows[index + offset]?.node.id;
      },
      firstRowId: () => rows[0]?.node.id,
      lastRowId: () => rows.at(-1)?.node.id,
      parentIdOf: (id) => {
        const index = indexById.get(id);
        return index === undefined ? undefined : rows[index].parentId;
      },
    }),
    [indexById, rows, virtualizer],
  );

  return (
    <div
      ref={treeRef}
      role="tree"
      aria-label={t('popup_bookmarkTree')}
      data-slot="popup-tree"
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize() }}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        const id = event.target.getAttribute(POPUP_TREE_ROW_ID_ATTRIBUTE);
        focusedIndexRef.current = id === null ? null : (indexById.get(id) ?? null);
      }}
    >
      {virtualizer.getVirtualItems().map((item) => {
        const row = rows[item.index];
        return (
          <div
            key={item.key}
            data-index={item.index}
            ref={virtualizer.measureElement}
            // Rows jump to their place: the reduced-motion rule gives every transition a tiny
            // duration, which would leave a moved row in its old place for a frame.
            className="absolute top-0 left-0 w-full px-2 transition-none"
            style={{
              transform: `translateY(${item.start}px)`,
              paddingLeft: `calc(0.5rem + ${(row.level - 1) * treeConfig.indent_px}px)`,
            }}
          >
            {row.kind === 'folder' ? (
              <FolderRow
                row={row}
                onToggle={() => setFolderExpanded(row.node.id, !row.expanded)}
                expandedIds={expanded}
              />
            ) : row.kind === 'bookmark' ? (
              <BookmarkRow row={row} />
            ) : (
              <NewFolderRow />
            )}
          </div>
        );
      })}
    </div>
  );
}
