/**
 * Breadcrumb navigation for BookmarksPage.
 * Shows the current folder path and allows clicking ancestors. A deep path shows its first
 * folder, a "…" menu with the folders in between, and its last folders
 * (`config/ui/manager-breadcrumb.toml`). When the path is still too long for the header,
 * ancestors shrink and truncate first and the end of the path stays in view, so the current
 * folder is always visible.
 */

import { ChevronRight, Home, MoreHorizontal } from 'lucide-react';
import { type ReactNode, useLayoutEffect, useMemo, useRef } from 'react';
import { z } from 'zod';

const breadcrumbConfig = readConfig(
  'ui/manager-breadcrumb',
  z.strictObject({ max_folders: z.number().int().min(2) }),
);

type BreadcrumbNavProps = {
  items: Bookmark[];
  currentFolderId: string | null;
  onNavigate: (folderId: string | null) => void;
  /**
   * The table lists matches from every folder (a search or filter not limited to the folder
   * shown): the path gives way to a label saying so.
   */
  allFolders?: boolean;
};

const SEGMENT_BUTTON_CLASS =
  'rounded-md px-2 py-1 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

/** One folder of the path, after its chevron. */
function Segment({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
      {children}
    </div>
  );
}

export function BreadcrumbNav({
  items,
  currentFolderId,
  onNavigate,
  allFolders = false,
}: BreadcrumbNavProps) {
  // Derived from the refreshed list so renames and moves show up immediately.
  const path = useMemo(
    () => getManagerFolderAncestors(items, currentFolderId),
    [items, currentFolderId],
  );
  const { head, hidden, tail } = collapseFolderPath(path, breadcrumbConfig.max_folders);
  const navRef = useRef<HTMLElement>(null);

  // A path that still overflows after truncating scrolls to its end: the current folder.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is the trigger.
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (nav) nav.scrollLeft = nav.scrollWidth;
  }, [path]);

  const renderFolder = (item: ManagerItem) => {
    const isLast = item.id === path.at(-1)?.id;
    const title = getBookmarkDisplayTitle(item.title);
    return (
      // Ancestors give up their width first (down to a few letters); the current folder keeps
      // its own.
      <Segment key={item.id} className={isLast ? 'shrink-0' : 'min-w-12 shrink'}>
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
            className={cn('min-w-0 max-w-[150px] truncate', SEGMENT_BUTTON_CLASS)}
          >
            {title}
          </button>
        )}
      </Segment>
    );
  };

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
        className={cn('flex shrink-0 items-center gap-1', SEGMENT_BUTTON_CLASS)}
      >
        <Home className="h-4 w-4" />
        <span className="hidden sm:inline">{t('bookmarks_root')}</span>
      </button>

      {allFolders ? (
        <Segment className="min-w-0">
          <span
            className="min-w-0 truncate px-2 py-1 font-medium text-foreground"
            aria-current="page"
            data-testid="breadcrumb-all-folders"
          >
            {t('qaManager_allFolders')}
          </span>
        </Segment>
      ) : null}
      {allFolders ? null : head.map(renderFolder)}
      {!allFolders && hidden.length > 0 && (
        <Segment className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className={cn('flex items-center', SEGMENT_BUTTON_CLASS)}
                  aria-label={t('bookmarks_breadcrumbHidden', String(hidden.length))}
                  title={t('bookmarks_breadcrumbHidden', String(hidden.length))}
                  data-testid="breadcrumb-more"
                />
              }
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-w-80">
              {hidden.map((item) => (
                <DropdownMenuItem key={item.id} onClick={() => onNavigate(item.id)}>
                  <span className="truncate">{getBookmarkDisplayTitle(item.title)}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Segment>
      )}
      {allFolders ? null : tail.map(renderFolder)}
    </nav>
  );
}
