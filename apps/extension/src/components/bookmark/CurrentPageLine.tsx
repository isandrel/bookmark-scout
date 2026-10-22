import { BookmarkCheck, FilePlus } from 'lucide-react';
import { useMemo } from 'react';
import type { BookmarkTreeNode } from '@/types';

/** The folder paths (outermost first, the root left out) of every bookmark of `url`. */
function findSavedFolderPaths(tree: readonly BookmarkTreeNode[], url: string): string[][] {
  const paths: string[][] = [];
  const visit = (nodes: readonly BookmarkTreeNode[], parents: string[]) => {
    for (const node of nodes) {
      if (node.url === url) paths.push(parents);
      if (!node.children) continue;
      visit(node.children, isBookmarkTreeRoot(node) ? parents : [...parents, node.title]);
    }
  };
  visit(tree, []);
  return paths;
}

/** Where the current page is saved, read before the first render, for while the tree loads. */
let savedBeforeTree: { url: string; paths: string[][] } | undefined;

/**
 * Reads the current page and where it is saved before the popup's first render
 * (`preloadPopupPage`), so both lines are on the first frame. The tree is still loading then,
 * so the folders come from the bookmarks of the page's URL and their parents.
 */
export async function preloadCurrentPageLine(): Promise<void> {
  const page = await preloadCurrentPage();
  if (!page) return;
  try {
    const saved = (await findBookmarksByUrl(page.url)).filter((node) => node.url === page.url);
    const paths = await Promise.all(saved.map((node) => getBookmarkFolderPath(node.parentId)));
    savedBeforeTree = { url: page.url, paths };
  } catch {
    // The tree, once loaded, still shows where the page is saved.
  }
}

const lineClassName =
  'flex h-6 shrink-0 items-center gap-1.5 border-b px-3 text-xs text-muted-foreground [@media(max-height:399px)]:hidden';

/**
 * One line under the popup and side panel search box naming the page a folder click saves, so a
 * first-time user sees what the folders are for, and a second one naming where the page is
 * already saved, so a save into another folder is a known second copy. Follows the tree, so a
 * save shows at once. Hidden while the page is unknown (the side panel before tab access) and,
 * like the other optional lines, below 400px of height.
 */
export function CurrentPageLine({ folders }: { folders: readonly BookmarkTreeNode[] }) {
  const page = useCurrentPage();
  const url = page?.url;
  const savedIn = useMemo(() => {
    if (!url) return [];
    // The tree is empty until it loads; until then, what was read before the first render.
    if (folders.length === 0 && savedBeforeTree?.url === url) return savedBeforeTree.paths;
    return findSavedFolderPaths(folders, url);
  }, [folders, url]);
  if (!page) return null;
  const text = t('newcomer_pageToSave', page.title);
  const savedText =
    savedIn.length > 0
      ? t(
          'qaPopup_alreadySavedIn',
          formatList(
            savedIn.map((path) =>
              path.map((title) => getBookmarkDisplayTitle(title)).join(FOLDER_PATH_SEPARATOR),
            ),
          ),
        )
      : null;
  return (
    <>
      <p data-testid="current-page-line" title={text} className={lineClassName}>
        <FilePlus aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">{text}</span>
      </p>
      {savedText && (
        <p data-testid="current-page-saved-in" title={savedText} className={lineClassName}>
          <BookmarkCheck aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">{savedText}</span>
          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            <IndexTabTextButton url={page.url} />
            <CaptureCoverButton url={page.url} />
          </span>
        </p>
      )}
    </>
  );
}
