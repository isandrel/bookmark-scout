import { BookmarkPlus, Folder, LoaderCircle } from 'lucide-react';
import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

type FolderMatchesPanelProps = {
  matches: readonly FolderMatch[];
  /** The typed search; any change to it shows the current order at once. */
  query: string;
  /** Title of the bookmarks bar, left out of the paths because most folders live there. */
  barTitle: string | undefined;
  truncateLength: number;
  pendingFolderIds: readonly string[];
  onSave: (folderId: string) => void;
  /** The tree's key handler, so arrow keys and Enter work the same here as in the tree. */
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  /** The search box, whose Enter saves into the first row; that row is highlighted meanwhile. */
  searchInputRef: RefObject<HTMLInputElement | null>;
};

/**
 * The matches in the order last shown while `hold` is on and the query is the same, so a save
 * that makes a folder recent does not reorder the rows under the pointer or the focused row.
 */
function useHeldMatchOrder(
  matches: readonly FolderMatch[],
  query: string,
  hold: boolean,
): readonly FolderMatch[] {
  const shown = useRef<{ query: string; matches: readonly FolderMatch[] } | null>(null);
  const last = shown.current;
  const result =
    hold && last?.query === query ? holdFolderMatchOrder(last.matches, matches) : matches;
  useLayoutEffect(() => {
    shown.current = { query, matches: result };
  });
  return result;
}

/**
 * "Save to folder": the folders matching the search, best first, above the bookmark results.
 * Each row is a tree row for the keyboard, so ArrowDown from the search box lands on the best
 * match and Enter saves the current page there. The first row is the combobox's default option:
 * Enter in the search box saves there, and it is highlighted while the search box has focus.
 */
export function FolderMatchesPanel({
  matches: rankedMatches,
  query,
  barTitle,
  truncateLength,
  pendingFolderIds,
  onSave,
  onKeyDown,
  searchInputRef,
}: FolderMatchesPanelProps) {
  const highlightFirst = usePopupEnterFocus(searchInputRef) === 'search';
  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  // Typing moves attention to the search box: a pointer resting on the list holds it again only
  // once it moves.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs for each change of the query.
  useEffect(() => setPointerInside(false), [query]);
  const matches = useHeldMatchOrder(rankedMatches, query, pointerInside || focusInside);
  return (
    <section
      onPointerMove={() => {
        if (!pointerInside) setPointerInside(true);
      }}
      onPointerLeave={() => setPointerInside(false)}
      onFocus={() => setFocusInside(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocusInside(false);
      }}
      aria-labelledby="folder-matches-title"
      data-testid="folder-matches"
      className="flex shrink-0 flex-col border-b px-2 pb-1.5 pt-1"
      style={{ maxHeight: `${FOLDER_MATCH_MAX_HEIGHT_FRACTION * PERCENT}%` }}
    >
      <h2
        id="folder-matches-title"
        className="px-2 pb-0.5 text-xs font-medium text-muted-foreground"
      >
        {t('popup_folderMatchesTitle')}
      </h2>
      <ul onKeyDown={onKeyDown} className="min-h-0 overflow-y-auto">
        {matches.map(({ folder, parents, titleRanges }, index) => {
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
                  ...(index === 0 ? { [POPUP_ENTER_TARGET_ATTRIBUTE]: true } : {}),
                }}
                data-active={(index === 0 && highlightFirst) || undefined}
                aria-label={t('popup_saveToFolder', fullPath)}
                title={fullPath}
                // aria-disabled, not disabled, so a row being saved keeps keyboard focus.
                aria-disabled={isPending || undefined}
                onClick={() => {
                  if (!isPending) onSave(folder.id);
                }}
                className="group flex h-8 w-full items-center gap-2 rounded-md px-2 text-left transition-colors duration-150 hover:bg-muted focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-disabled:opacity-60 data-active:bg-accent"
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
                    className="size-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-active:opacity-100"
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
