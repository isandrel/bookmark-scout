/**
 * RecentFoldersPanel component.
 * Shows recently used folders for quick bookmark saving.
 */

import { Clock, Folder } from 'lucide-react';

interface RecentFoldersPanelProps {
  onAddToFolder: (folderId: string) => void;
  maxFolders: number;
  /** Folders the current page is being saved into; their chips are disabled meanwhile. */
  pendingFolderIds?: readonly string[];
}

export function RecentFoldersPanel({
  onAddToFolder,
  maxFolders,
  pendingFolderIds = [],
}: RecentFoldersPanelProps) {
  const { recentFolders, isLoading } = useRecentFolders();

  // Limit to maxFolders
  const displayFolders = recentFolders.slice(0, maxFolders);

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
      {displayFolders.map((folder: RecentFolder) => {
        const isPending = pendingFolderIds.includes(folder.id);
        return (
          <Button
            key={folder.id}
            variant="outline"
            size="sm"
            className="h-6 shrink-0 gap-1.5 rounded-full px-2.5 text-xs font-normal hover:bg-accent aria-disabled:pointer-events-none aria-disabled:opacity-50"
            onClick={() => {
              if (!isPending) onAddToFolder(folder.id);
            }}
            aria-disabled={isPending || undefined}
            title={`Add to "${folder.title}"`}
          >
            <Folder className="h-3 w-3 text-muted-foreground" />
            <span className="truncate max-w-[120px]">{folder.title}</span>
          </Button>
        );
      })}
    </div>
  );
}
