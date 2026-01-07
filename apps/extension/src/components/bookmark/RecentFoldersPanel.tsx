/**
 * RecentFoldersPanel component.
 * Shows recently used folders for quick bookmark saving.
 */

import { Clock, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@/hooks/use-i18n';
import { useRecentFolders, type RecentFolder } from '@/lib/recent-folders-storage';

interface RecentFoldersPanelProps {
  onAddToFolder: (folderId: string) => void;
  maxFolders: number;
}

export function RecentFoldersPanel({ onAddToFolder, maxFolders }: RecentFoldersPanelProps) {
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
    <div className="border-b px-3 py-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Clock className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {t('recentFolders')}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {displayFolders.map((folder: RecentFolder) => (
          <Button
            key={folder.id}
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs gap-1.5 hover:bg-accent"
            onClick={() => onAddToFolder(folder.id)}
            title={`Add to "${folder.title}"`}
          >
            <Folder className="h-3 w-3 text-amber-500" />
            <span className="truncate max-w-[120px]">{folder.title}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
