/**
 * BookmarksPage - Full-page bookmark management view.
 * Overrides chrome://bookmarks with a custom data table interface.
 * Features: Left sidebar (folders), collapsible right sidebar (tools), breadcrumb navigation.
 */

import { t } from '@/hooks/use-i18n';
import {
  type Bookmark,
  ItemTypeEnum,
  useBookmarkNavigation,
} from '@/hooks/use-bookmarks-page';
import { columns } from '../ui/table/columns';
import { DataTable } from '../ui/table/data-table';
import { BreadcrumbNav } from '../bookmarks/BreadcrumbNav';
import { FolderTree } from '../bookmarks/FolderTree';
import { ToolsSidebar } from '../bookmarks/ToolsSidebar';
import { useState, useEffect } from 'react';
import { PanelLeftClose, PanelLeft, PanelRightClose, PanelRight } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

export default function BookmarksPage() {
  const { currentFolder, data, isLoading, error, navigateToFolder } =
    useBookmarkNavigation();
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(true);
  const [currentFolderName, setCurrentFolderName] = useState<string | undefined>();

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
          'border-r bg-muted/30 transition-all duration-200 overflow-hidden',
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
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
                className="shrink-0"
                title={leftSidebarCollapsed ? 'Show folders' : 'Hide folders'}
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
              title={rightSidebarCollapsed ? 'Show tools' : 'Hide tools'}
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
        <div className="flex-1 overflow-auto p-4">
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
              data={data}
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
              currentFolderId={currentFolder || undefined}
            />
          )}
        </div>
      </main>

      {/* Right Sidebar - Tools */}
      <aside
        className={cn(
          'border-l bg-muted/30 transition-all duration-200 overflow-hidden',
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
    </div>
  );
}

// Re-export types and hooks for backwards compatibility
export { useParentIdMap, useUrlMap } from '@/hooks/use-bookmarks-page';
export type { Bookmark } from '@/hooks/use-bookmarks-page';
