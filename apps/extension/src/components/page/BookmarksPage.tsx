/**
 * BookmarksPage - Full-page bookmark management view.
 * Overrides chrome://bookmarks with a custom data table interface.
 * Features: Left sidebar (folders), collapsible right sidebar (tools), breadcrumb navigation.
 */

import { Info, PanelLeft, PanelLeftClose, PanelRight, PanelRightClose, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

const getBookmarkRowId = (bookmark: Bookmark) => bookmark.id;
const isFolderRow = (bookmark: Bookmark) => bookmark.type === ItemTypeEnum.Folder;

function toDeletionTarget(bookmark: Bookmark): BookmarkDeletionTarget {
  return {
    id: bookmark.id,
    title: bookmark.title,
    type: bookmark.type === ItemTypeEnum.Folder ? 'folder' : 'bookmark',
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
    refresh,
  } = useBookmarkNavigation();
  const { toast } = useToast();
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(true);
  const [selectedBookmark, setSelectedBookmark] = useState<Bookmark | null>(null);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const { value: sortOrder } = useSetting('sortOrder');
  const { pendingDeletion, requestDeletion, confirmDeletion, cancelDeletion } =
    useBookmarkDeletion(refresh);
  const columns = useMemo(
    () =>
      createColumns({
        onViewDetails: setSelectedBookmark,
        onEdit: setEditingBookmark,
        onDelete: (bookmark) => requestDeletion(toDeletionTarget(bookmark)),
        onOpenInNewTab: (bookmark) => {
          if (!bookmark.url || !isOpenableBookmark(bookmark)) return;
          openBookmarkInNewTab(bookmark.url).catch((openError: unknown) =>
            toast({
              title: `× ${t('bookmarks_openFailed')}`,
              description: openError instanceof Error ? openError.message : t('error_unknown'),
              variant: 'destructive',
            }),
          );
        },
      }),
    [requestDeletion, toast],
  );
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
  const facetOptions = useMemo(() => {
    const domains = [
      ...new Set(allData.map((bookmark) => getUrlDomain(bookmark.url)).filter(Boolean)),
    ].sort((left, right) => left.localeCompare(right));
    return {
      parentId: buildFolderOptions(allData, t('bookmarks_untitled')),
      domain: domains.map((domain) => ({
        value: domain,
        label: domain,
        icon: () => (
          <img src={getFaviconUrl(`https://${domain}/`)} alt="" className="mr-2 h-4 w-4" />
        ),
      })),
    };
  }, [allData]);

  const currentFolderName = useMemo(() => {
    if (!currentFolder) return undefined;
    const folder = allData.find((bookmark) => bookmark.id === currentFolder);
    return folder ? folder.title.trim() || t('bookmarks_untitled') : undefined;
  }, [allData, currentFolder]);

  const renderSelectionActions = useCallback(
    (rows: Bookmark[], clearSelection: () => void) => (
      <BookmarkBulkActions
        selected={rows}
        allData={allData}
        onClearSelection={clearSelection}
        onDelete={(items) => {
          const [first] = items;
          if (!first) return;
          clearSelection();
          void requestDeletion({ ...toDeletionTarget(first), items: items.map(toDeletionTarget) });
        }}
      />
    ),
    [allData, requestDeletion],
  );

  if (error) {
    return (
      <div className="flex h-[450px] w-full items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-destructive">
            {t('error_generic')}
          </h2>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Left Sidebar - Folders. Collapsed sidebars are inert so they leave the tab order. */}
      <aside
        className={cn(
          'shrink-0 border-r bg-muted/30 transition-all duration-200 overflow-hidden',
          leftSidebarCollapsed ? 'w-0' : 'w-64'
        )}
        inert={leftSidebarCollapsed}
        aria-hidden={leftSidebarCollapsed || undefined}
        data-testid="folder-sidebar"
      >
        <div className="w-64 h-full overflow-y-auto">
          <div className="p-2 border-b">
            <h2 className="text-sm font-semibold px-2">
              {t('bookmarks_root')}
            </h2>
          </div>
          <FolderTree
            items={allData}
            selectedFolderId={currentFolder}
            onFolderSelect={navigateToFolder}
          />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
                className="shrink-0"
                title={leftSidebarCollapsed ? t('bookmarks_showFolders') : t('bookmarks_hideFolders')}
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
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setRightSidebarCollapsed(!rightSidebarCollapsed)}
              className="shrink-0"
              title={rightSidebarCollapsed ? t('bookmarks_showTools') : t('bookmarks_hideTools')}
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

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-4 overflow-auto p-4">
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
                size="icon"
                className="h-6 w-6"
                aria-label={t('action_dismiss')}
                onClick={dismissNotice}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <h2 className="text-lg font-semibold">
                  {t('bookmarks_loading')}
                </h2>
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
              facetOptions={facetOptions}
              renderSelectionActions={renderSelectionActions}
              isRowActivatable={isFolderRow}
              rowClassName={(row: Bookmark) => {
                const baseClass = 'cursor-pointer hover:bg-muted/50';
                const folderClass =
                  row.type === ItemTypeEnum.Folder
                    ? 'is-folder bg-muted/50 hover:bg-muted/70 focus-visible:outline-2 focus-visible:outline-ring'
                    : '';
                return `${baseClass} ${folderClass}`;
              }}
              onRowClick={(row: Bookmark) => {
                if (row.type === ItemTypeEnum.Folder) {
                  navigateToFolder(row.id);
                }
              }}
            />
          )}
        </div>
      </main>

      {/* Right Sidebar - Tools */}
      <aside
        className={cn(
          'shrink-0 border-l bg-muted/30 transition-all duration-200 overflow-hidden',
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
        bookmark={editingBookmark}
        onClose={() => setEditingBookmark(null)}
        onSaved={refresh}
      />
      <BookmarkDeleteDialog
        deletion={pendingDeletion}
        onCancel={cancelDeletion}
        onConfirm={confirmDeletion}
      />
      <Toaster />
    </div>
  );
}
