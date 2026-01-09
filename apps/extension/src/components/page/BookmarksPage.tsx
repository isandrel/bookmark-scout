/**
 * BookmarksPage - Full-page bookmark management view.
 * Overrides chrome://bookmarks with a custom data table interface.
 * Features: Sidebar tree view, breadcrumb navigation, and collapsible tools panel.
 */

import { t } from '@/hooks/use-i18n';
import {
  type Bookmark,
  ItemTypeEnum,
  useBookmarkNavigation,
} from '@/hooks/use-bookmarks-page';
import { columns } from '../ui/table/columns';
import { DataTable } from '../ui/table/data-table';
import { ToolsPanel } from '../bookmarks/ToolsPanel';
import { BreadcrumbNav } from '../bookmarks/BreadcrumbNav';
import { FolderTree } from '../bookmarks/FolderTree';
import { useState } from 'react';
import { PanelLeftClose, PanelLeft } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

export default function BookmarksPage() {
  const { currentFolder, data, isLoading, error, navigateToFolder } =
    useBookmarkNavigation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
      {/* Sidebar */}
      <aside
        className={cn(
          'border-r bg-muted/30 transition-all duration-200 overflow-hidden',
          sidebarCollapsed ? 'w-0' : 'w-64'
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
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="shrink-0"
              >
                {sidebarCollapsed ? (
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
            <div className="border rounded-lg bg-background shrink-0">
              <ToolsPanel />
            </div>
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
    </div>
  );
}

// Re-export types and hooks for backwards compatibility
export { useParentIdMap, useUrlMap } from '@/hooks/use-bookmarks-page';
export type { Bookmark } from '@/hooks/use-bookmarks-page';
