/**
 * BookmarksPage - Full-page bookmark management view.
 * Overrides chrome://bookmarks with a custom data table interface.
 * Features: Left sidebar (folders), collapsible right sidebar (tools), breadcrumb navigation.
 */

import { PanelLeft, PanelLeftClose, PanelRight, PanelRightClose } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

export default function BookmarksPage() {
  const { currentFolder, data, allData, isLoading, error, navigateToFolder, refreshCurrentFolder } =
    useBookmarkNavigation();
  const { toast } = useToast();
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(true);
  const [currentFolderName, setCurrentFolderName] = useState<string | undefined>();
  const [selectedBookmark, setSelectedBookmark] = useState<Bookmark | null>(null);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const { value: sortOrder } = useSetting('sortOrder');
  const refreshTable = useCallback(
    () => refreshCurrentFolder({ background: true }),
    [refreshCurrentFolder],
  );
  const { pendingDeletion, requestDeletion, confirmDeletion, cancelDeletion } =
    useBookmarkDeletion(refreshTable);
  const columns = useMemo(
    () =>
      createColumns({
        onViewDetails: setSelectedBookmark,
        onEdit: setEditingBookmark,
        onDelete: (bookmark) =>
          requestDeletion({
            id: bookmark.id,
            title: bookmark.title,
            type: bookmark.type === ItemTypeEnum.Folder ? 'folder' : 'bookmark',
          }),
        onOpenInNewTab: (bookmark) => {
          if (!bookmark.url) return;
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
  const sortedAllData = useMemo(
    () => sortBookmarkItems(allData, sortOrder, sortAccessors),
    [allData, sortOrder, sortAccessors],
  );

  // Get current folder name for display
  useEffect(() => {
    if (!currentFolder) {
      setCurrentFolderName(undefined);
      return;
    }

    if (chrome?.bookmarks) {
      chrome.bookmarks.get(currentFolder, (results) => {
        if (results?.[0]) {
          setCurrentFolderName(results[0].title || 'Untitled');
        }
      });
    }
  }, [currentFolder]);

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
      {/* Left Sidebar - Folders */}
      <aside
        className={cn(
          'shrink-0 border-r bg-muted/30 transition-all duration-200 overflow-hidden',
          leftSidebarCollapsed ? 'w-0' : 'w-64'
        )}
      >
        <div className="w-64 h-full overflow-y-auto">
          <div className="p-2 border-b">
            <h2 className="text-sm font-semibold px-2">
              {t('bookmarks_root')}
            </h2>
          </div>
          <FolderTree
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
              >
                {leftSidebarCollapsed ? (
                  <PanelLeft className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </Button>
              <BreadcrumbNav
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
        <div className="min-w-0 flex-1 overflow-auto p-4">
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
              allData={sortedAllData}
              rowClassName={(row: Bookmark) => {
                const baseClass = 'cursor-pointer hover:bg-muted/50';
                const folderClass =
                  row.type === ItemTypeEnum.Folder
                    ? 'bg-muted/50 hover:bg-muted/70'
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
        onSaved={refreshTable}
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
