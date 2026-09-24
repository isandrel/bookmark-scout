/**
 * Breadcrumb navigation for BookmarksPage.
 * Shows the current folder path and allows clicking ancestors.
 */

import { ChevronRight, Home } from 'lucide-react';
import { useMemo } from 'react';

type BreadcrumbNavProps = {
  items: Bookmark[];
  currentFolderId: string | null;
  onNavigate: (folderId: string | null) => void;
};

export function BreadcrumbNav({ items, currentFolderId, onNavigate }: BreadcrumbNavProps) {
  // Derived from the refreshed list so renames and moves show up immediately.
  const path = useMemo(
    () => getManagerFolderAncestors(items, currentFolderId),
    [items, currentFolderId],
  );

  return (
    <nav
      className="flex items-center gap-1 overflow-x-auto text-sm text-muted-foreground"
      aria-label={t('bookmarks_breadcrumb')}
      data-testid="breadcrumb"
    >
      <button
        type="button"
        onClick={() => onNavigate(null)}
        className="flex shrink-0 items-center gap-1 rounded px-2 py-1 transition-colors hover:bg-muted hover:text-foreground"
      >
        <Home className="h-4 w-4" />
        <span className="hidden sm:inline">{t('bookmarks_root')}</span>
      </button>

      {path.map((item, index) => {
        const isLast = index === path.length - 1;
        const title = item.title.trim() || t('bookmarks_untitled');
        return (
          <div key={item.id} className="flex shrink-0 items-center gap-1">
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
            {isLast ? (
              <span
                className="max-w-[200px] truncate px-2 py-1 font-medium text-foreground"
                aria-current="page"
              >
                {title}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(item.id)}
                className="max-w-[150px] truncate rounded px-2 py-1 transition-colors hover:bg-muted hover:text-foreground"
              >
                {title}
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
}
