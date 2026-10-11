/**
 * Drag and drop in the bookmark manager, after Chrome's (`dnd_manager.ts`), with the browser's
 * own drag and drop so links come in from other pages and apps and go out to them:
 *
 * - Rows drag (the selection, when the row is in it) and so do folders in the tree, except the
 *   top-level ones. A drag carries the bookmarks' URLs (`text/uri-list`, plain text, and HTML
 *   links) for other apps, and their ids for this page and other manager tabs.
 * - Drops on rows reorder (only while the table shows the folder in the browser's order) or go
 *   into a folder row; drops on the table's empty space go to the end of the folder shown; drops
 *   on a folder in the tree go into it, and hovering a closed folder there opens it.
 * - Links dropped from elsewhere become bookmarks where they land.
 *
 * Every drop is one undo history entry. The drop indicator is a `data-drop-zone` attribute on the
 * row (`before`, `after`, or `into`), styled in theme.css.
 */

import {
  type DragEvent,
  type HTMLAttributes,
  type RefObject,
  useCallback,
  useMemo,
  useRef,
} from 'react';

type DragDropOptions = {
  allData: readonly Bookmark[];
  /** The folder shown; null is the top level, which takes no drops. */
  currentFolderId: string | null;
  table: RefObject<DataTableHandle<Bookmark> | null>;
};

const LINK_TYPES = ['text/uri-list', 'text/x-moz-url', 'text/plain'];

function setDropZone(element: Element | null, zone: BookmarkDropZone | null) {
  for (const marked of document.querySelectorAll('[data-drop-zone]')) {
    if (marked !== element || zone === null) marked.removeAttribute('data-drop-zone');
  }
  if (element && zone) element.setAttribute('data-drop-zone', zone);
}

function readDraggedIds(event: DragEvent): string[] | null {
  const raw = event.dataTransfer.getData(MANAGER_DRAG_TYPE);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : null;
  } catch {
    return null;
  }
}

export function useManagerDragDrop({ allData, currentFolderId, table }: DragDropOptions) {
  const latest = useRef({ allData, currentFolderId });
  latest.current = { allData, currentFolderId };
  // Ids dragged from this page; a drag from another manager tab carries them in its data.
  const draggedRef = useRef<string[] | null>(null);
  const destinationRef = useRef<ManagerDropDestination | null>(null);
  const expandTimer = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  const startDrag = useCallback((event: DragEvent, items: Bookmark[]) => {
    const movable = items.filter(isModifiableBookmark);
    if (movable.length === 0) {
      event.preventDefault();
      return;
    }
    const ids = pruneNestedSelection(movable, latest.current.allData).map((item) => item.id);
    draggedRef.current = ids;
    const { text, html } = bookmarkClipboardData(movable);
    const urls = movable.flatMap((item) => (item.url ? [item.url] : []));
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData(MANAGER_DRAG_TYPE, JSON.stringify(ids));
    if (urls.length > 0) event.dataTransfer.setData('text/uri-list', urls.join('\r\n'));
    event.dataTransfer.setData('text/plain', text);
    event.dataTransfer.setData('text/html', html);
  }, []);

  const endDrag = useCallback(() => {
    draggedRef.current = null;
    destinationRef.current = null;
    setDropZone(null, null);
    if (expandTimer.current) clearTimeout(expandTimer.current.timer);
    expandTimer.current = null;
  }, []);

  /** Whether the drag carries something a drop can use: our items, or links. */
  const isUsable = (event: DragEvent) => {
    const types = Array.from(event.dataTransfer.types);
    return (
      draggedRef.current !== null ||
      types.includes(MANAGER_DRAG_TYPE) ||
      LINK_TYPES.some((type) => types.includes(type))
    );
  };
  const isOwnDrag = (event: DragEvent) =>
    draggedRef.current !== null || Array.from(event.dataTransfer.types).includes(MANAGER_DRAG_TYPE);

  const accept = (
    event: DragEvent,
    destination: ManagerDropDestination | null,
    element: Element | null,
    zone: BookmarkDropZone | null,
  ) => {
    destinationRef.current = destination;
    if (!destination) {
      event.dataTransfer.dropEffect = 'none';
      setDropZone(null, null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = isOwnDrag(event) ? 'move' : 'copy';
    setDropZone(element, zone);
  };

  const dropTargetFor = (item: Bookmark): ManagerDropTarget => ({
    id: item.id,
    parentId: item.parentId,
    isFolder: item.type === ItemTypeEnum.Folder,
    movable: isModifiableBookmark(item),
  });

  /** The end of the folder shown, when it takes new items. */
  const folderEnd = (): ManagerDropDestination | null => {
    const { currentFolderId: folderId, allData: items } = latest.current;
    const folder = folderId ? getManagerItemsById(items).get(folderId) : undefined;
    if (!folder || folder.unmodifiable) return null;
    return resolveManagerDrop(draggedRef.current ?? [], dropTargetFor(folder), 'into', items);
  };

  const drop = useCallback(
    async (event: DragEvent) => {
      const destination = destinationRef.current;
      const ids = draggedRef.current ?? readDraggedIds(event);
      endDrag();
      if (!destination) return;
      event.preventDefault();
      try {
        if (ids) {
          await moveBookmarksTo(ids, destination);
          return;
        }
        const links = parseDroppedLinks({
          uriList: event.dataTransfer.getData('text/uri-list'),
          mozUrl: event.dataTransfer.getData('text/x-moz-url'),
          plain: event.dataTransfer.getData('text/plain'),
          html: event.dataTransfer.getData('text/html'),
        });
        if (links.length === 0) return;
        await addDroppedLinks(links, destination);
        toast.success({ title: tPlural('toast_linksAdded', links.length) });
      } catch (error) {
        toast.error({
          title: t(ids ? 'toast_errorMovingItem' : 'toast_linksAddFailed'),
          description: getErrorMessage(error),
        });
      }
    },
    [endDrag],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: the handlers read refs only.
  return useMemo(() => {
    /** Props for a table row: it drags the selection it is in, or itself. */
    const rowProps = (row: Bookmark): HTMLAttributes<HTMLTableRowElement> => ({
      draggable: isModifiableBookmark(row),
      onDragStart: (event) => startDrag(event, table.current?.targetRowsAt(row.id) ?? [row]),
      onDragEnd: endDrag,
    });

    /** Handlers for the table's frame: drops on rows and on its empty space. */
    const frameProps: HTMLAttributes<HTMLDivElement> = {
      onDragOver: (event) => {
        if (!isUsable(event)) return;
        const rowElement = (event.target as Element).closest?.('tr[data-row-id]');
        const item = rowElement
          ? getManagerItemsById(latest.current.allData).get(
              (rowElement as HTMLElement).dataset.rowId ?? '',
            )
          : undefined;
        if (item) {
          const box = rowElement?.getBoundingClientRect();
          const fraction = box && box.height > 0 ? (event.clientY - box.top) / box.height : 0.5;
          const target = dropTargetFor(item);
          const zone = getManagerDropZone(
            target,
            fraction,
            table.current?.canReorderRows() ?? false,
          );
          const destination = zone
            ? resolveManagerDrop(draggedRef.current ?? [], target, zone, latest.current.allData)
            : null;
          if (destination) {
            accept(event, destination, rowElement, zone);
            return;
          }
          // Our own rows dropped where they cannot go stay put; links still land in the folder.
          if (isOwnDrag(event)) {
            accept(event, null, null, null);
            return;
          }
        }
        accept(event, folderEnd(), null, null);
      },
      onDragLeave: (event) => {
        if (!(event.currentTarget as Element).contains(event.relatedTarget as Node | null)) {
          setDropZone(null, null);
        }
      },
      onDrop: (event) => void drop(event),
    };

    /** Handlers for the folder tree: drags of its folders, and drops into them. */
    const treeProps: HTMLAttributes<HTMLDivElement> = {
      onDragStart: (event) => {
        const element = (event.target as Element).closest?.(
          '[data-folder-id]',
        ) as HTMLElement | null;
        const folder = element?.dataset.folderId
          ? getManagerItemsById(latest.current.allData).get(element.dataset.folderId)
          : undefined;
        if (folder) startDrag(event, [folder]);
      },
      onDragEnd: endDrag,
      onDragOver: (event) => {
        if (!isUsable(event)) return;
        const element = (event.target as Element).closest?.(
          '[data-folder-id]',
        ) as HTMLElement | null;
        const folderId = element?.dataset.folderId;
        const folder = folderId
          ? getManagerItemsById(latest.current.allData).get(folderId)
          : undefined;
        if (!folder || folder.unmodifiable) {
          accept(event, null, null, null);
          return;
        }
        // Hovering a closed folder opens it, so a drag can reach the folders inside.
        if (expandTimer.current?.id !== folder.id) {
          if (expandTimer.current) clearTimeout(expandTimer.current.timer);
          expandTimer.current = {
            id: folder.id,
            timer: setTimeout(() => {
              if (element?.getAttribute('aria-expanded') !== 'false') return;
              element.querySelector<HTMLElement>(`[${FOLDER_TREE_TOGGLE_ATTRIBUTE}]`)?.click();
            }, MANAGER_DRAG_AUTO_EXPAND_MS),
          };
        }
        const destination = resolveManagerDrop(
          draggedRef.current ?? [],
          dropTargetFor(folder),
          'into',
          latest.current.allData,
        );
        accept(event, destination, element, 'into');
      },
      onDragLeave: (event) => {
        if (!(event.currentTarget as Element).contains(event.relatedTarget as Node | null)) {
          setDropZone(null, null);
        }
      },
      onDrop: (event) => void drop(event),
    };

    return { rowProps, frameProps, treeProps };
  }, []);
}
