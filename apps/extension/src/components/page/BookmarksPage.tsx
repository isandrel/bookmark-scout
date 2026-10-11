/**
 * BookmarksPage - Full-page bookmark management view.
 * Overrides chrome://bookmarks with a custom data table interface.
 * Features: Left sidebar (folders), collapsible right sidebar (tools), breadcrumb navigation.
 */

import {
  CircleAlert,
  Info,
  Link2,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

const layout = readConfig(
  'ui/layout',
  z.strictObject({
    manager: z.strictObject({
      both_sidebars_min_width: z.number().int().positive(),
      folders_open: z.boolean(),
      tools_open: z.boolean(),
    }),
  }),
).manager;

const getBookmarkRowId = (bookmark: Bookmark) => bookmark.id;

// Narrower than this, the folder and tools sidebars together leave the table too little room,
// so opening one closes the other.
const BOTH_SIDEBARS_QUERY = `(min-width: ${layout.both_sidebars_min_width}px)`;
const fitsBothSidebars = () => window.matchMedia(BOTH_SIDEBARS_QUERY).matches;
const isFolderRow = (bookmark: Bookmark) => bookmark.type === ItemTypeEnum.Folder;

/** Copies the address that opens `folderId` (null: the top level) and says so in a toast. */
async function copyManagerFolderLink(folderId: string | null) {
  const link = getManagerFolderLink(
    folderId,
    import.meta.env.BROWSER,
    browser.runtime.getURL(BOOKMARK_MANAGER_PATH),
  );
  try {
    await navigator.clipboard.writeText(link);
    toast.success({ title: t('bookmarks_folderLinkCopied') });
  } catch (error) {
    toast.error({ title: t('bookmarks_detailsCopyFailed'), description: getErrorMessage(error) });
  }
}

function toDeletionTarget(bookmark: Bookmark): BookmarkDeletionTarget {
  return {
    id: bookmark.id,
    title: bookmark.title,
    type: bookmark.type === ItemTypeEnum.Folder ? 'folder' : 'bookmark',
    ...(bookmark.url !== undefined ? { url: bookmark.url } : {}),
  };
}

export default function BookmarksPage() {
  const {
    currentFolder,
    data,
    allData,
    isLoading,
    error,
    notice,
    dismissNotice,
    navigateToFolder,
    searchQuery,
    setSearchQuery,
    folderPageIndex,
    rememberPageIndex,
    refresh,
  } = useBookmarkNavigation();
  const [revealRow, setRevealRow] = useState<DataTableRevealRequest | null>(null);
  const tableRef = useRef<DataTableHandle<Bookmark>>(null);
  // Both open is narrowed to one by the effect below when the window is too small.
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(!layout.folders_open);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(!layout.tools_open);
  const toggleLeftSidebar = () => {
    if (leftSidebarCollapsed && !fitsBothSidebars()) setRightSidebarCollapsed(true);
    setLeftSidebarCollapsed(!leftSidebarCollapsed);
  };
  const toggleRightSidebar = () => {
    if (rightSidebarCollapsed && !fitsBothSidebars()) setLeftSidebarCollapsed(true);
    setRightSidebarCollapsed(!rightSidebarCollapsed);
  };
  // Shrinking the window with both sidebars open closes the folder sidebar.
  useEffect(() => {
    if (leftSidebarCollapsed || rightSidebarCollapsed) return;
    const query = window.matchMedia(BOTH_SIDEBARS_QUERY);
    const collapseFolders = () => {
      if (!query.matches) setLeftSidebarCollapsed(true);
    };
    collapseFolders();
    query.addEventListener('change', collapseFolders);
    return () => query.removeEventListener('change', collapseFolders);
  }, [leftSidebarCollapsed, rightSidebarCollapsed]);
  const [selectedBookmark, setSelectedBookmark] = useState<Bookmark | null>(null);
  const [editTarget, setEditTarget] = useState<BookmarkEditTarget | null>(null);
  const { value: sortOrder } = useSetting('sortOrder');
  // Labels built in memos below must be rebuilt when the language changes.
  const { value: language } = useSetting('language');
  const deletion = useBookmarkDeletion({ onChanged: refresh, recordHistory: true });
  const { requestDeletion } = deletion;
  const opener = useBookmarkOpener();
  const { open: openUrls } = opener;
  const history = useBookmarkHistoryCommands();
  // Enter opens one folder in the manager; anything else opens in tabs, as in Chrome's manager.
  const openRows = useCallback(
    (rows: Bookmark[], target: BookmarkOpenTarget) => {
      const [first] = rows;
      if (target === 'tabs' && rows.length === 1 && first?.type === ItemTypeEnum.Folder) {
        navigateToFolder(first.id);
        return;
      }
      openUrls(getOpenableUrls(rows, allData), target);
    },
    [allData, navigateToFolder, openUrls],
  );
  // Deletes the items, leaving out those inside another deleted folder.
  const deleteItems = (rows: Bookmark[]) => {
    const items = pruneNestedSelection(rows, allData).map(toDeletionTarget);
    const [first] = items;
    if (first) void requestDeletion({ ...first, items: items.length > 1 ? items : undefined });
  };
  const showInFolder = useCallback(
    (bookmark: Bookmark) => {
      const folderId = bookmark.parentId;
      if (!folderId) return;
      navigateToFolder(folderId, { clearSearch: true });
      setRevealRow({ rowId: bookmark.id, resetKey: folderId });
    },
    [navigateToFolder],
  );
  const managerCommands = useManagerCommands({
    allData,
    folderItems: data,
    currentFolderId: currentFolder,
    searchQuery,
    showDetails: setSelectedBookmark,
    edit: setEditTarget,
    requestDeletion: deleteItems,
    showInFolder,
    copyFolderLink: (folderId) => void copyManagerFolderLink(folderId),
    open: openRows,
  });
  const shortcuts = useManagerShortcuts({
    currentFolderId: currentFolder,
    items: allData,
    onNavigate: navigateToFolder,
    table: tableRef,
    commands: {
      deleteRows: (rows) => deleteItems(rows),
      renameRow: (bookmark) => setEditTarget({ mode: 'edit', bookmark }),
      openRows,
      undo: history.undo,
      redo: history.redo,
    },
    clipboard: managerCommands.clipboardEvents,
  });
  const dragDrop = useManagerDragDrop({ allData, currentFolderId: currentFolder, table: tableRef });
  const columns = useMemo(
    () =>
      createColumns({
        actionHost: managerCommands.tableItemHost,
      }),
    [managerCommands],
  );
  // A right click on a row acts on the selection when the row is in it, else on that row.
  const resolveRowMenuItems = useCallback((target: EventTarget | null) => {
    const row = target instanceof Element ? target.closest<HTMLElement>('tr[data-row-id]') : null;
    const rowId = row?.dataset.rowId;
    return rowId ? (tableRef.current?.targetRowsAt(rowId) ?? []) : [];
  }, []);
  const allDataRef = useRef(allData);
  allDataRef.current = allData;
  const resolveTreeMenuItems = useCallback((target: EventTarget | null) => {
    const element =
      target instanceof Element ? target.closest<HTMLElement>('[data-folder-id]') : null;
    const folder = element?.dataset.folderId
      ? getManagerItemsById(allDataRef.current).get(element.dataset.folderId)
      : undefined;
    return folder ? [folder] : [];
  }, []);
  const sortAccessors = useMemo(
    () => ({
      getTitle: (bookmark: Bookmark) => bookmark.title,
      getDateAdded: (bookmark: Bookmark) => bookmark.dateAdded ?? bookmark.dateGroupModified,
      isFolder: (bookmark: Bookmark) => bookmark.type === ItemTypeEnum.Folder,
      getIndex: (bookmark: Bookmark) => bookmark.index,
    }),
    [],
  );

  const sortedData = useMemo(
    () => sortBookmarkItems(data, sortOrder, sortAccessors),
    [data, sortOrder, sortAccessors],
  );
  const browserOrderData = useMemo(
    () => [...data].sort((left, right) => (left.index ?? 0) - (right.index ?? 0)),
    [data],
  );
  const sortedAllData = useMemo(
    () => sortBookmarkItems(allData, sortOrder, sortAccessors),
    [allData, sortOrder, sortAccessors],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: t() inside reads the language, which must rebuild the labels.
  const facetOptions = useMemo(() => {
    const domains = [
      ...new Set(allData.map(getBookmarkDomain).filter(Boolean)),
    ].sort((left, right) => left.localeCompare(right));
    return {
      parentId: buildFolderOptions(allData, t('popup_untitled')),
      domain: domains.map((domain) => ({
        value: domain,
        label: domain,
        icon: () => <SiteIcon url={`https://${domain}/`} className="mr-2" />,
      })),
    };
  }, [allData, language]);

  const savedSearchContext = useMemo<DataTableSavedSearchContext>(
    () => ({
      currentFolderId: currentFolder,
      folderIds: new Set(allData.filter(isFolderRow).map((bookmark) => bookmark.id)),
      onNavigateToFolder: navigateToFolder,
    }),
    [allData, currentFolder, navigateToFolder],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: t() inside reads the language, which must rebuild the labels.
  const currentFolderName = useMemo(() => {
    if (!currentFolder) return undefined;
    const folder = allData.find((bookmark) => bookmark.id === currentFolder);
    return folder ? getBookmarkDisplayTitle(folder.title) : undefined;
  }, [allData, currentFolder, language]);

  // The tab names the search or the folder; it runs after the page title the mount sets, also
  // when the language changes.
  const languageRevision = useLanguageRevision();
  // biome-ignore lint/correctness/useExhaustiveDependencies: t() inside reads the language, which must rebuild the title.
  useEffect(() => {
    document.title = getManagerPageTitle(currentFolderName, searchQuery);
  }, [currentFolderName, searchQuery, languageRevision]);

  const renderSelectionActions = useCallback(
    (rows: Bookmark[], hiddenCount: number, clearSelection: () => void) => (
      <BookmarkBulkActions
        selected={rows}
        hiddenCount={hiddenCount}
        allData={allData}
        onClearSelection={clearSelection}
        onDelete={(items) => {
          const [first] = items;
          if (!first) return;
          // Cancelling the confirmation keeps the selection, and so does a deletion that left
          // items behind; deleted rows drop out of it on refresh. A complete deletion clears it.
          void requestDeletion({
            ...toDeletionTarget(first),
            items: items.map(toDeletionTarget),
            onDone: ({ skipped, failed }) => {
              if (skipped === 0 && failed === 0) clearSelection();
            },
          });
        }}
      />
    ),
    [allData, requestDeletion],
  );

  if (error) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-2 p-6 text-center">
        <CircleAlert aria-hidden="true" className="size-6 text-destructive-text" />
        <h2 className="text-lg font-semibold text-destructive-text">{t('error_generic')}</h2>
        <p className="max-w-md text-sm text-muted-foreground [overflow-wrap:anywhere]">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Left Sidebar - Folders. Collapsed sidebars are inert so they leave the tab order. */}
      <aside
        className={cn(
          'shrink-0 border-r transition-all duration-200 overflow-hidden',
          leftSidebarCollapsed ? 'w-0' : 'w-64'
        )}
        inert={leftSidebarCollapsed}
        aria-hidden={leftSidebarCollapsed || undefined}
        data-testid="folder-sidebar"
      >
        <div className="w-64 h-full overflow-y-auto">
          <div className="flex h-14 items-center border-b px-4">
            <h2 className="text-sm font-semibold">{t('bookmarks_root')}</h2>
          </div>
          <ItemContextMenu
            resolveItems={resolveTreeMenuItems}
            itemHost={managerCommands.treeItemHost}
            testId="folder-tree-menu-area"
            areaProps={dragDrop.treeProps}
          >
            <FolderTree
              items={allData}
              selectedFolderId={currentFolder}
              onFolderSelect={navigateToFolder}
            />
          </ItemContextMenu>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center border-b px-4">
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleLeftSidebar}
                className="shrink-0"
                title={leftSidebarCollapsed ? t('bookmarks_showFolders') : t('bookmarks_hideFolders')}
                aria-label={
                  leftSidebarCollapsed ? t('bookmarks_showFolders') : t('bookmarks_hideFolders')
                }
                aria-expanded={!leftSidebarCollapsed}
              >
                {leftSidebarCollapsed ? (
                  <PanelLeft className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </Button>
              <BreadcrumbNav
                items={allData}
                currentFolderId={currentFolder}
                onNavigate={navigateToFolder}
              />
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                title={t('bookmarks_copyFolderLink')}
                aria-label={t('bookmarks_copyFolderLink')}
                onClick={() => void copyManagerFolderLink(currentFolder)}
              >
                <Link2 className="h-4 w-4" />
              </Button>
            </div>
            <ManagerShortcutsHelp
              open={shortcuts.helpOpen}
              onOpenChange={shortcuts.setHelpOpen}
            />
            <OrganizeMenu host={managerCommands.folderHost} />
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleRightSidebar}
              className="shrink-0"
              title={rightSidebarCollapsed ? t('bookmarks_showTools') : t('bookmarks_hideTools')}
              aria-label={rightSidebarCollapsed ? t('bookmarks_showTools') : t('bookmarks_hideTools')}
              aria-expanded={!rightSidebarCollapsed}
            >
              {rightSidebarCollapsed ? (
                <PanelRight className="h-4 w-4" />
              ) : (
                <PanelRightClose className="h-4 w-4" />
              )}
            </Button>
          </div>
        </header>

        {/* Content. Positioned, so absolutely positioned descendants (screen-reader-only labels)
            are laid out inside this scroll area instead of stretching the page below the
            viewport, which let the whole page scroll away to a blank screen. */}
        <div className="relative min-w-0 flex-1 space-y-4 overflow-auto p-4">
          {notice && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
              data-testid="folder-notice"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1">{notice}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t('action_dismiss')}
                onClick={dismissNotice}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          {isLoading ? (
            <div role="status" aria-label={t('bookmarks_loading')} className="space-y-3">
              <div className="flex gap-2">
                <Skeleton className="h-9 w-56" />
                <Skeleton className="h-9 w-56" />
              </div>
              <div className="space-y-px overflow-hidden rounded-md border bg-card">
                {Array.from({ length: 6 }, (_, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows.
                  <Skeleton key={index} className="h-12 rounded-none" />
                ))}
              </div>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={sortedData}
              browserOrderData={browserOrderData}
              allData={sortedAllData}
              getRowId={getBookmarkRowId}
              canSelectRow={isModifiableBookmark}
              resetKey={currentFolder}
              initialPageIndex={folderPageIndex}
              onPageIndexChange={rememberPageIndex}
              facetOptions={facetOptions}
              renderSelectionActions={renderSelectionActions}
              savedSearchContext={savedSearchContext}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              revealRow={revealRow}
              handleRef={tableRef}
              getRowProps={dragDrop.rowProps}
              renderFrame={(frame) => (
                <ItemContextMenu
                  resolveItems={resolveRowMenuItems}
                  itemHost={managerCommands.tableItemHost}
                  folderHost={managerCommands.folderHost}
                  testId="bookmark-table-menu-area"
                  areaProps={dragDrop.frameProps}
                >
                  {frame}
                </ItemContextMenu>
              )}
              label={currentFolderName ?? t('bookmarks_root')}
              rowClassName={(row: Bookmark) =>
                row.type === ItemTypeEnum.Folder
                  ? 'is-folder bg-muted/50 hover:bg-muted/70'
                  : 'hover:bg-muted/50'
              }
              onRowOpen={(row: Bookmark) => openRows([row], 'tabs')}
              onRowOpenInBackground={(row: Bookmark) => {
                if (row.type !== ItemTypeEnum.Folder) openRows([row], 'background-tabs');
              }}
            />
          )}
        </div>
      </main>

      {/* Right Sidebar - Tools */}
      <aside
        className={cn(
          'shrink-0 border-l transition-all duration-200 overflow-hidden',
          rightSidebarCollapsed ? 'w-0' : 'w-80'
        )}
        inert={rightSidebarCollapsed}
        aria-hidden={rightSidebarCollapsed || undefined}
        data-testid="tools-sidebar"
      >
        <div className="w-80 h-full overflow-y-auto">
          <ToolsSidebar
            currentFolderId={currentFolder}
            currentFolderName={currentFolderName}
          />
        </div>
      </aside>

      <BookmarkDetailsDialog
        bookmark={selectedBookmark}
        onClose={() => setSelectedBookmark(null)}
        onOpenFolder={navigateToFolder}
      />
      <BookmarkEditDialog
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={refresh}
      />
      <BookmarkDeleteDialog deletion={deletion} />
      <BookmarkOpenDialog opener={opener} />
      <Toaster />
    </div>
  );
}
