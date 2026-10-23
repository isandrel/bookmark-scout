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
import type { BookmarkTreeNode } from '@/types';

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

/** A bookmark row's outer element (its fill and actions), which holds the link that takes focus. */
const BOOKMARK_ROW_SELECTOR = '.bookmark-item';
/** Any row's outer element: a bookmark's or a folder's. */
const ROW_SELECTOR = `${BOOKMARK_ROW_SELECTOR}, .folder-item`;

/** The hover card target for the bookmark row `element` is in; null for folders and separators. */
function bookmarkRowTarget(element: EventTarget | null): HoverCardTarget | null {
  const row =
    element instanceof Element ? element.closest<HTMLElement>(BOOKMARK_ROW_SELECTOR) : null;
  // Built here, not at module level: this module and use-popup-shortcuts.ts import each other.
  const link = row?.querySelector<HTMLElement>(`[${POPUP_TREE_ROW_ATTRIBUTE}="bookmark"][href]`);
  const id = link?.getAttribute(POPUP_TREE_ROW_ID_ATTRIBUTE);
  return row && link && id ? { id, anchor: row, described: link } : null;
}

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
  // Tree Density: the rows size themselves from CSS variables; the list needs the numbers.
  const { value: density } = useSetting('treeDensity');
  const metrics = popupTreeDensity(density);

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
    estimateSize: () => metrics.row_height_px,
    overscan: POPUP_TREE_VIEW.overscan_rows,
    paddingStart: POPUP_TREE_VIEW.padding_px,
    paddingEnd: POPUP_TREE_VIEW.padding_px,
    getItemKey: (index) => rows[index].node.id,
    rangeExtractor,
  });

  const treeRef = useRef<HTMLDivElement>(null);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  // A bookmark's details on hover and keyboard focus (Show Details on Hover), from the whole tree,
  // so a search result shows its folder too.
  const { value: hoverDetails } = useSetting('showHoverDetails');
  const hoverCard = useHoverCard(hoverDetails);
  const { fullNode } = usePopupTree();
  const resolveHoverBookmark = (id: string): HoverCardBookmark | undefined => {
    const node = fullNode(id);
    if (!node?.url) return undefined;
    return {
      id,
      title: node.title,
      url: node.url,
      folderPath: folderPathOf(node.parentId, fullNode),
      ...(node.dateAdded === undefined ? {} : { dateAdded: node.dateAdded }),
    };
  };

  // A density change leaves every measured row the wrong height until it is measured again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the density changes.
  useEffect(() => virtualizer.measure(), [density, virtualizer]);

  /** The row a right click is on, for the row menu. */
  const resolveMenuRow = (target: EventTarget | null) => {
    const rowElement = target instanceof Element ? target.closest(ROW_SELECTOR) : null;
    const id = rowElement
      ?.querySelector(`[${POPUP_TREE_ROW_ID_ATTRIBUTE}]`)
      ?.getAttribute(POPUP_TREE_ROW_ID_ATTRIBUTE);
    const index = id ? indexById.get(id) : undefined;
    const row = index === undefined ? undefined : rows[index];
    if (!row || row.kind === 'new-folder') return null;
    return { kind: row.kind, node: row.node };
  };

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
    <PopupRowMenus resolveRow={resolveMenuRow}>
      <div
        ref={treeRef}
        role="tree"
        aria-label={t('popup_bookmarkTree')}
        data-slot="popup-tree"
        data-density={density}
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize(), ...popupTreeDensityStyle(density) }}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          const id = event.target.getAttribute(POPUP_TREE_ROW_ID_ATTRIBUTE);
          focusedIndexRef.current = id === null ? null : (indexById.get(id) ?? null);
          if (!hoverDetails) return;
          // Keyboard focus only: a click focuses the row too, and opens it.
          const target = event.target.matches(':focus-visible')
            ? bookmarkRowTarget(event.target)
            : null;
          if (target) preloadBookmarkHoverCard();
          hoverCard.controller.focus(target);
        }}
        onBlur={() => hoverCard.controller.focus(null)}
        onPointerOver={(event) => {
          if (!hoverDetails || event.pointerType === 'touch') return;
          const target = bookmarkRowTarget(event.target);
          if (target) preloadBookmarkHoverCard();
          hoverCard.controller.hover(target);
        }}
        onPointerLeave={() => hoverCard.controller.hover(null)}
        // A press opens, drags, or deletes the row; its card stays closed until the row is left.
        onPointerDown={() => hoverCard.controller.dismiss()}
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
                paddingLeft: `calc(0.5rem + ${(row.level - 1) * metrics.indent_px}px)`,
              }}
            >
              {row.kind === 'folder' ? (
                <FolderRow
                  row={row}
                  onToggle={() => setFolderExpanded(row.node.id, !row.expanded)}
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
      <BookmarkHoverCard hoverCard={hoverCard} resolve={resolveHoverBookmark} />
    </PopupRowMenus>
  );
}
