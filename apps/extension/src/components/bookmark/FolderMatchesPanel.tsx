import type { KeyboardEvent } from 'react';
import { BookmarkPlus, Folder, LoaderCircle } from 'lucide-react';

type FolderMatchesPanelProps = {
  matches: readonly FolderMatch[];
  /** Title of the bookmarks bar, left out of the paths because most folders live there. */
  barTitle: string | undefined;
  truncateLength: number;
  pendingFolderIds: readonly string[];
  onSave: (folderId: string) => void;
  /** The tree's key handler, so arrow keys and Enter work the same here as in the tree. */
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
};

/**
 * "Save to folder": the folders matching the search, best first, above the bookmark results.
 * Each row is a tree row for the keyboard, so ArrowDown from the search box lands on the best
 * match and Enter saves the current page there.
 */
export function FolderMatchesPanel({
  matches,
  barTitle,
  truncateLength,
  pendingFolderIds,
  onSave,
  onKeyDown,
}: FolderMatchesPanelProps) {
  return (
    <section
      aria-labelledby="folder-matches-title"
      data-testid="folder-matches"
      className="flex shrink-0 flex-col border-b px-2 pb-1.5 pt-1"
      style={{ maxHeight: `${FOLDER_MATCH_MAX_HEIGHT_FRACTION * 100}%` }}
    >
      <h2 id="folder-matches-title" className="px-2 pb-0.5 text-xs font-medium text-muted-foreground">
        {t('popup_folderMatchesTitle')}
      </h2>
      <ul onKeyDown={onKeyDown} className="min-h-0 overflow-y-auto">
        {matches.map(({ folder, parents, titleRanges }) => {
          const title = getBookmarkDisplayTitle(folder.title);
          const shownParents = parents[0] === barTitle ? parents.slice(1) : parents;
          const path = shownParents
            .map((parent) => truncateText(getBookmarkDisplayTitle(parent), truncateLength))
            .join(FOLDER_PATH_SEPARATOR);
          const fullPath = [...parents, folder.title]
            .map((part) => getBookmarkDisplayTitle(part))
            .join(FOLDER_PATH_SEPARATOR);
          const isPending = pendingFolderIds.includes(folder.id);
          return (
            <li key={folder.id}>
              <button
                type="button"
                data-slot="folder-match"
                {...{
                  [POPUP_TREE_ROW_ATTRIBUTE]: 'folder',
                  [POPUP_TREE_FOLDER_ATTRIBUTE]: folder.id,
                  [POPUP_TREE_CAN_SAVE_ATTRIBUTE]: true,
                }}
                aria-label={t('popup_saveToFolder', fullPath)}
                title={fullPath}
                // aria-disabled, not disabled, so a row being saved keeps keyboard focus.
                aria-disabled={isPending || undefined}
                onClick={() => {
                  if (!isPending) onSave(folder.id);
                }}
                className="group flex h-8 w-full items-center gap-2 rounded-md px-2 text-left transition-colors duration-150 hover:bg-muted focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-disabled:opacity-60"
              >
                <Folder aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                {/* One line, like a tree row: the name, then where it is, which truncates first. */}
                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                  <HighlightedText
                    className="max-w-[70%] shrink-0 truncate text-sm"
                    text={truncateText(title, truncateLength)}
                    ranges={titleRanges}
                  />
                  {path ? (
                    <span className="min-w-0 truncate text-xs text-muted-foreground">{path}</span>
                  ) : null}
                </span>
                {isPending ? (
                  <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin" />
                ) : (
                  <BookmarkPlus
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
