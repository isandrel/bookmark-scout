import type { SortOrder } from './settings-schema';
import type { BookmarkTreeNode } from '@/types';

export type BookmarkSortAccessors<T> = {
  getTitle: (item: T) => string;
  getDateAdded: (item: T) => number | undefined;
  isFolder: (item: T) => boolean;
  getIndex?: (item: T) => number | undefined;
  isPinned?: (item: T) => boolean;
};

type SortableItem<T> = {
  item: T;
  originalPosition: number;
};

type SortComparator<T> = (
  left: SortableItem<T>,
  right: SortableItem<T>,
  accessors: BookmarkSortAccessors<T>,
) => number;

const titleCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

function compareTitles<T>(
  left: SortableItem<T>,
  right: SortableItem<T>,
  accessors: BookmarkSortAccessors<T>,
) {
  return titleCollator.compare(accessors.getTitle(left.item), accessors.getTitle(right.item));
}

function compareBrowserOrder<T>(
  left: SortableItem<T>,
  right: SortableItem<T>,
  accessors: BookmarkSortAccessors<T>,
) {
  const leftIndex = accessors.getIndex?.(left.item);
  const rightIndex = accessors.getIndex?.(right.item);

  if (leftIndex !== undefined && rightIndex !== undefined && leftIndex !== rightIndex) {
    return leftIndex - rightIndex;
  }

  return left.originalPosition - right.originalPosition;
}

const sortComparators = {
  date: <T>(left: SortableItem<T>, right: SortableItem<T>, accessors: BookmarkSortAccessors<T>) => {
    const leftDate = accessors.getDateAdded(left.item);
    const rightDate = accessors.getDateAdded(right.item);

    if (leftDate !== rightDate) {
      if (leftDate === undefined) return 1;
      if (rightDate === undefined) return -1;
      return rightDate - leftDate;
    }

    return compareTitles(left, right, accessors);
  },
  alphabetical: compareTitles,
  folders: <T>(
    left: SortableItem<T>,
    right: SortableItem<T>,
    accessors: BookmarkSortAccessors<T>,
  ) => Number(accessors.isFolder(right.item)) - Number(accessors.isFolder(left.item)),
} satisfies Record<SortOrder, SortComparator<unknown>>;

/**
 * Return a sorted copy without changing Chrome's persisted bookmark order.
 * New strategies are centralized in sortComparators and enforced by SortOrder.
 */
export function sortBookmarkItems<T>(
  items: readonly T[],
  order: SortOrder,
  accessors: BookmarkSortAccessors<T>,
): T[] {
  return items
    .map((item, originalPosition) => ({ item, originalPosition }))
    .sort((left, right) => {
      const leftPinned = accessors.isPinned?.(left.item) ?? false;
      const rightPinned = accessors.isPinned?.(right.item) ?? false;

      if (leftPinned !== rightPinned) {
        return leftPinned ? -1 : 1;
      }

      const comparison = sortComparators[order](left, right, accessors);
      return comparison || compareBrowserOrder(left, right, accessors);
    })
    .map(({ item }) => item);
}

/** Sort every level of a bookmark tree while preserving UI-only node state. */
export function sortBookmarkTree(
  nodes: readonly BookmarkTreeNode[],
  order: SortOrder,
): BookmarkTreeNode[] {
  const withSortedChildren = nodes.map((node) => ({
    ...node,
    children: node.children ? sortBookmarkTree(node.children, order) : undefined,
  }));

  return sortBookmarkItems(withSortedChildren, order, {
    getTitle: (node) => node.title.replace(/<[^>]*>/g, ''),
    getDateAdded: (node) => node.dateAdded ?? node.dateGroupModified,
    isFolder: (node) => node.children !== undefined,
    getIndex: (node) => node.index,
    isPinned: (node) => node.isTemporary === true,
  });
}
