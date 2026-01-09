/**
 * BookmarksPage - Full-page bookmark management view.
 * Overrides chrome://bookmarks with a custom data table interface.
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

export default function BookmarksPage() {
  const { currentFolder, data, isLoading, error, navigateToFolder } =
    useBookmarkNavigation();

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

  if (isLoading) {
    return (
      <div className="flex h-[450px] w-full items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold">
            {t('state_loadingSettings')}
          </h2>
          <p className="text-sm text-muted-foreground">
            Please wait while we load your bookmarks
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-4">
      {/* Tools Panel - collapsed by default */}
      <div className="border rounded-lg bg-background">
        <ToolsPanel />
      </div>

      {/* Data Table */}
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
    </div>
  );
}

// Re-export types and hooks for backwards compatibility
export { useParentIdMap, useUrlMap } from '@/hooks/use-bookmarks-page';
export type { Bookmark } from '@/hooks/use-bookmarks-page';
