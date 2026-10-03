/**
 * Breadcrumb navigation for BookmarksPage.
 * Shows the current folder path and allows clicking ancestors. When the path is too long for the
 * header, ancestors shrink and truncate first and the end of the path stays in view, so the
 * current folder is always visible.
 */

import { ChevronRight, Home } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef } from 'react';

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
  const navRef = useRef<HTMLElement>(null);

  // A path that still overflows after truncating scrolls to its end: the current folder.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is the trigger.
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (nav) nav.scrollLeft = nav.scrollWidth;
  }, [path]);

  return (
    <nav
      ref={navRef}
      className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm text-muted-foreground"
      aria-label={t('bookmarks_breadcrumb')}
      data-testid="breadcrumb"
    >
      <button
        type="button"
        onClick={() => onNavigate(null)}
        className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <Home className="h-4 w-4" />
        <span className="hidden sm:inline">{t('bookmarks_root')}</span>
      </button>

      {path.map((item, index) => {
        const isLast = index === path.length - 1;
        const title = getBookmarkDisplayTitle(item.title);
        return (
          // Ancestors give up their width first (down to a few letters); the current folder
          // keeps its own.
          <div
            key={item.id}
            className={cn('flex items-center gap-1', isLast ? 'shrink-0' : 'min-w-12 shrink')}
          >
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
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
                title={title}
                className="min-w-0 max-w-[150px] truncate rounded-md px-2 py-1 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
