/**
 * RecentFoldersPanel component.
 * Shows recently used folders for quick bookmark saving.
 */

import { Clock, Folder } from 'lucide-react';
import { useMemo } from 'react';
import type { BookmarkTreeNode } from '@/types';

interface RecentFoldersPanelProps {
  /** The whole tree, to name each folder's parents where two chips share a title. */
  folders: readonly BookmarkTreeNode[];
  onAddToFolder: (folderId: string) => void;
  maxFolders: number;
  /** Folders the current page is being saved into; their chips are disabled meanwhile. */
  pendingFolderIds?: readonly string[];
}

export function RecentFoldersPanel({
  folders,
  onAddToFolder,
  maxFolders,
  pendingFolderIds = [],
}: RecentFoldersPanelProps) {
  const { recentFolders, isLoading } = useRecentFolders();

  // Limit to maxFolders; folders with the same title are told apart by their parents.
  const displayFolders = useMemo(
    () => labelRecentFolders(recentFolders.slice(0, maxFolders), folders),
    [folders, maxFolders, recentFolders],
  );

  if (isLoading) {
    return null;
  }

  if (displayFolders.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
      <div className="mr-0.5 flex shrink-0 items-center gap-1.5">
        <Clock className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {t('popup_recentFolders')}
        </span>
      </div>
      {displayFolders.map((folder) => {
        const isPending = pendingFolderIds.includes(folder.id);
        const title = getBookmarkDisplayTitle(folder.title);
        const context = folder.context.map(getBookmarkDisplayTitle).join(FOLDER_PATH_SEPARATOR);
        // The chip shows the name (and where it is when names repeat), so the label also says
        // what clicking does; the tooltip always has the full path.
        const addLabel = t(
          'popup_addToFolderTitle',
          context ? `${context}${FOLDER_PATH_SEPARATOR}${title}` : title,
        );
        const fullPath = folder.path.map(getBookmarkDisplayTitle).join(FOLDER_PATH_SEPARATOR);
        return (
          <Button
            key={folder.id}
            variant="outline"
            size="sm"
            data-slot="recent-folder"
            className="h-6 min-w-0 max-w-full shrink-0 gap-1.5 rounded-full px-2.5 text-xs font-normal hover:bg-accent aria-disabled:pointer-events-none aria-disabled:opacity-50"
            onClick={() => {
              if (!isPending) onAddToFolder(folder.id);
            }}
            aria-disabled={isPending || undefined}
            title={t('popup_addToFolderTitle', fullPath)}
            aria-label={addLabel}
          >
            <Folder className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="max-w-[120px] truncate">{title}</span>
            {context && (
              <span
                data-slot="recent-folder-context"
                className="max-w-[100px] truncate text-muted-foreground"
              >
                {context}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
