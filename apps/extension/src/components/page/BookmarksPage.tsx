/**
 * BookmarksPage - Full-page bookmark management view.
 * Overrides chrome://bookmarks with a custom data table interface.
 * Features: Left sidebar (folders), collapsible right sidebar (tools), breadcrumb navigation.
 */

import {
  CircleAlert,
  History,
  Info,
  Link2,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
  X,
} from 'lucide-react';
import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const getBookmarkRowId = (bookmark: Bookmark) => bookmark.id;

const isFolderRow = (bookmark: Bookmark) => bookmark.type === ItemTypeEnum.Folder;

/** Copies the address that opens `folderId` (null: the top level) and says so in a toast. */
async function copyManagerFolderLink(folderId: string | null) {
  const link = getManagerFolderLink(
    folderId,
    currentBrowser(),
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
    rootId,
    data,
    allData,
    tree,
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
  const searchMatches = useSearchMatches(tree, searchQuery);
  const [revealRow, setRevealRow] = useState<DataTableRevealRequest | null>(null);
  // Whether the table lists matches from every folder; the breadcrumb then says so.
  const [showsAllFolders, setShowsAllFolders] = useState(false);
  const tableRef = useRef<DataTableHandle<Bookmark>>(null);
  // How many rows are selected, so the Tools sidebar can offer to run on them.
  const [selectedCount, setSelectedCount] = useState(0);
  const searching = searchQuery.trim() !== '';
  // What the table lists, for tools that run on search results or the selection (Smart Rules):
  // the bookmarks only, read from the table when a run starts.
  const listing = useMemo<ManagerListing>(
    () => ({
      available: [
        ...(searching ? (['search'] as const) : []),
        ...(selectedCount > 0 ? (['selection'] as const) : []),
      ],
      ids: (scope) => {
        const table = tableRef.current;
        const rows = scope === 'search' ? table?.getShownRows() : table?.getSelectedRows();
        return (rows ?? []).flatMap((row) => (row.type === ItemTypeEnum.Link ? [row.id] : []));
      },
    }),
    [searching, selectedCount],
  );
  const sidebars = useManagerSidebars();
  const leftSidebarCollapsed = !sidebars.folders.open;
  const rightSidebarCollapsed = !sidebars.tools.open;
  const foldersToggleRef = useRef<HTMLButtonElement>(null);
  const toolsToggleRef = useRef<HTMLButtonElement>(null);
  // In a narrow window the folder drawer closes once a folder is picked.
  const { overlay: sidebarOverlay, folders: foldersSidebar } = sidebars;
  const selectTreeFolder = useCallback(
    (folderId: string | null) => {
      navigateToFolder(folderId);
      if (sidebarOverlay) foldersSidebar.close();
    },
    [foldersSidebar, navigateToFolder, sidebarOverlay],
  );
  // A drawer takes focus when it opens, and Escape closes it, giving focus back to its button.
  const drawerKeyDown =
    (sidebar: ManagerSidebar, toggle: RefObject<HTMLButtonElement | null>) =>
    (event: KeyboardEvent<HTMLElement>) => {
      if (!sidebarOverlay || event.key !== 'Escape' || hasOpenOverlay()) return;
      event.stopPropagation();
      sidebar.close();
      toggle.current?.focus();
    };
  const foldersAsideRef = useRef<HTMLElement>(null);
  const toolsAsideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!sidebarOverlay) return;
    const aside = sidebars.folders.open
      ? foldersAsideRef.current
      : sidebars.tools.open
        ? toolsAsideRef.current
        : null;
    aside?.querySelector<HTMLElement>('[tabindex="0"], button, input')?.focus();
  }, [sidebarOverlay, sidebars.folders.open, sidebars.tools.open]);
  const [selectedBookmark, setSelectedBookmark] = useState<Bookmark | null>(null);
  const preview = useBookmarkPreview(tableRef);
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
    preview: preview.open,
    edit: setEditTarget,
    requestDeletion: deleteItems,
    showInFolder,
    copyFolderLink: (folderId) => void copyManagerFolderLink(folderId),
    open: openRows,
  });
  const allDataRef = useRef(allData);
  allDataRef.current = allData;
  // The folder of the tree row `target` is in: what its menu, keys, and clipboard act on.
  const resolveTreeMenuItems = useCallback((target: EventTarget | null) => {
    const element =
      target instanceof Element ? target.closest<HTMLElement>('[data-folder-id]') : null;
    const folder = element?.dataset.folderId
      ? getManagerItemsById(allDataRef.current).get(element.dataset.folderId)
      : undefined;
    return folder ? [folder] : [];
  }, []);
  const shortcuts = useManagerShortcuts({
    currentFolderId: currentFolder,
    items: allData,
    onNavigate: navigateToFolder,
    table: tableRef,
    commands: {
      deleteRows: (rows) => deleteItems(rows),
      renameRow: (bookmark) => setEditTarget({ mode: 'edit', bookmark }),
      openRows,
      previewRows: (rows) => runItemMenuAction('preview', rows, managerCommands.tableItemHost),
      undo: history.undo,
      redo: history.redo,
    },
    treeFolderAt: (target) => resolveTreeMenuItems(target)[0],
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
  // A right click on a row or card acts on the selection when it is in it, else on that one.
  const resolveRowMenuItems = useCallback((target: EventTarget | null) => {
    const row = target instanceof Element ? target.closest<HTMLElement>('[data-row-id]') : null;
    const rowId = row?.dataset.rowId;
    return rowId ? (tableRef.current?.targetRowsAt(rowId) ?? []) : [];
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
  // What each folder card counts.
  const folderItemCounts = useMemo(() => countFolderItems(allData), [allData]);
  // The Summary column shows a summary it cuts short whole in this card.
  const hoverCard = useHoverCard(true);
  const resolveHoverBookmark = useCallback(
    (id: string): HoverCardBookmark | undefined => {
      const item = getManagerItemsById(allData).get(id);
      if (!item?.url) return undefined;
      return {
        id,
        title: item.title,
        url: item.url,
        folderPath: item.folderPath,
        ...(item.dateAdded === undefined ? {} : { dateAdded: item.dateAdded }),
      };
    },
    [allData],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: t() inside reads the language, which must rebuild the label.
  const dataOrder = useMemo(
    () => ({ browserOrder: sortOrder === 'browser', label: getSortOrderLabel(sortOrder) }),
    [sortOrder, language],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: t() inside reads the language, which must rebuild the labels.
  const facetOptions = useMemo(() => {
    const domains = [...new Set(allData.map(getBookmarkDomain).filter(Boolean))].sort(
      (left, right) => left.localeCompare(right),
    );
    return {
      parentId: buildFolderOptions(allData, t('popup_untitled')),
      domain: domains.map((domain) => ({
        value: domain,
        label: domain,
        icon: () => <SiteIcon url={`https://${domain}/`} className="mr-2" />,
      })),
    };
  }, [allData, language]);
  const folderLabels = useMemo(
    () => new Map(facetOptions.parentId.map((option) => [option.value, option.label])),
    [facetOptions.parentId],
  );
  const openHistory = useAuditHistoryView((view) => view.openHistory);
  const [tasksOpen, setTasksOpen] = useState(
    () => window.location.hash === `#${MANAGER_TASKS_HASH}`,
  );

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
      {/* In a narrow window an open sidebar is a drawer over the table; a click beside it
          closes it (Escape does from the keyboard). */}
      {sidebarOverlay && (sidebars.folders.open || sidebars.tools.open) && (
        // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only scrim; Escape closes the drawer from the keyboard.
        // biome-ignore lint/a11y/useKeyWithClickEvents: see above.
        <div
          className="fixed inset-0 z-30 bg-black/40"
          data-testid="sidebar-scrim"
          onClick={() => {
            sidebars.folders.close();
            sidebars.tools.close();
          }}
        />
      )}
      {/* Left Sidebar - Folders. Collapsed sidebars are inert so they leave the tab order. */}
      <aside
        ref={foldersAsideRef}
        className={cn(
          'shrink-0 overflow-hidden border-r transition-all duration-200',
          sidebarOverlay && 'fixed inset-y-0 left-0 z-40 bg-background shadow-lg',
          leftSidebarCollapsed ? 'w-0 border-r-0' : 'w-64 max-w-[85vw]',
        )}
        inert={leftSidebarCollapsed}
        aria-hidden={leftSidebarCollapsed || undefined}
        data-testid="folder-sidebar"
        data-overlay={sidebarOverlay || undefined}
        onKeyDown={drawerKeyDown(sidebars.folders, foldersToggleRef)}
      >
        <div className="h-full w-64 max-w-[85vw] overflow-y-auto">
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
              onFolderSelect={selectTreeFolder}
              onFolderKey={shortcuts.handleTreeFolderKey}
            />
          </ItemContextMenu>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        {/* The path takes the room the buttons leave and scrolls or collapses inside it; the
            buttons keep their size, so they never overlap. */}
        <header className="flex h-14 shrink-0 items-center border-b px-2 sm:px-4">
          <div className="flex w-full min-w-0 items-center gap-2 sm:gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
              <Button
                ref={foldersToggleRef}
                variant="ghost"
                size="icon"
                onClick={sidebars.folders.toggle}
                className="shrink-0"
                title={
                  leftSidebarCollapsed ? t('bookmarks_showFolders') : t('bookmarks_hideFolders')
                }
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
                allFolders={showsAllFolders}
              />
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                title={t('bookmarks_copyFolderLink')}
                aria-label={t('bookmarks_copyFolderLink')}
                // The top level by the root's id: an address without one opens the bookmarks bar.
                onClick={() => void copyManagerFolderLink(currentFolder ?? rootId ?? null)}
              >
                <Link2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex shrink-0 items-center gap-1" data-testid="manager-header-actions">
              <TasksButton onOpen={() => setTasksOpen(true)} />
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                title={t('history_button')}
                aria-label={t('history_button')}
                onClick={() => openHistory()}
              >
                <History className="h-4 w-4" />
              </Button>
              <ManagerShortcutsHelp
                open={shortcuts.helpOpen}
                onOpenChange={shortcuts.setHelpOpen}
              />
              <OrganizeMenu host={managerCommands.folderHost} />
              <Button
                ref={toolsToggleRef}
                variant="ghost"
                size="icon"
                onClick={sidebars.tools.toggle}
                className="shrink-0"
                title={rightSidebarCollapsed ? t('bookmarks_showTools') : t('bookmarks_hideTools')}
                aria-label={
                  rightSidebarCollapsed ? t('bookmarks_showTools') : t('bookmarks_hideTools')
                }
                aria-expanded={!rightSidebarCollapsed}
              >
                {rightSidebarCollapsed ? (
                  <PanelRight className="h-4 w-4" />
                ) : (
                  <PanelRightClose className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </header>

        {/* Content. Positioned, so absolutely positioned descendants (screen-reader-only labels)
            are laid out inside this scroll area instead of stretching the page below the
            viewport, which let the whole page scroll away to a blank screen. */}
        <div className="relative flex min-w-0 flex-1 flex-col gap-4 overflow-auto p-4">
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
            <HoverCardControllerContext.Provider value={hoverCard.controller}>
              <DataTable
                columns={columns}
                data={sortedData}
                browserOrderData={browserOrderData}
                dataOrder={dataOrder}
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
                searchMatches={searchMatches}
                onSearchQueryChange={setSearchQuery}
                revealRow={revealRow}
                onShowsAllBookmarksChange={setShowsAllFolders}
                onSelectedCountChange={setSelectedCount}
                handleRef={tableRef}
                getRowProps={dragDrop.rowProps}
                renderFrame={(frame) => (
                  // Fills the room down to the pagination, so right clicks and drops below the
                  // rows reach the folder's empty-space menu and its end.
                  <ItemContextMenu
                    resolveItems={resolveRowMenuItems}
                    itemHost={managerCommands.tableItemHost}
                    folderHost={managerCommands.folderHost}
                    className="flex-1"
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
                cardMedia={(row: Bookmark) => <BookmarkCardMedia item={row} />}
                cardDetails={(row: Bookmark) => (
                  <BookmarkCardDetails
                    item={row}
                    folderItemCount={folderItemCounts.get(row.id) ?? 0}
                  />
                )}
                onRowOpen={(row: Bookmark) => openRows([row], 'tabs')}
                onRowOpenInBackground={(row: Bookmark) => {
                  if (row.type !== ItemTypeEnum.Folder) openRows([row], 'background-tabs');
                }}
              />
            </HoverCardControllerContext.Provider>
          )}
          <BookmarkHoverCard hoverCard={hoverCard} resolve={resolveHoverBookmark} />
        </div>
        <HistoryDialog folderLabels={folderLabels} />
        <TasksDialog open={tasksOpen} onOpenChange={setTasksOpen} />
      </main>

      {/* Right Sidebar - Tools */}
      <aside
        ref={toolsAsideRef}
        className={cn(
          'shrink-0 overflow-hidden border-l transition-all duration-200',
          sidebarOverlay && 'fixed inset-y-0 right-0 z-40 bg-background shadow-lg',
          rightSidebarCollapsed ? 'w-0 border-l-0' : 'w-80 max-w-[85vw]',
        )}
        inert={rightSidebarCollapsed}
        aria-hidden={rightSidebarCollapsed || undefined}
        data-testid="tools-sidebar"
        data-overlay={sidebarOverlay || undefined}
        onKeyDown={drawerKeyDown(sidebars.tools, toolsToggleRef)}
      >
        <div className="h-full w-80 max-w-[85vw] overflow-y-auto">
          <ToolsSidebar
            currentFolderId={currentFolder}
            currentFolderName={currentFolderName}
            listing={listing}
          />
        </div>
      </aside>

      <BookmarkDetailsDialog
        bookmark={selectedBookmark}
        onClose={() => setSelectedBookmark(null)}
        onOpenFolder={navigateToFolder}
      />
      <BookmarkPreviewDialog
        bookmark={preview.bookmark}
        rows={preview.rows}
        host={managerCommands.tableItemHost}
        onShow={preview.show}
        onClose={preview.close}
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
