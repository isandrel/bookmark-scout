/**
 * Fetch Cover from the manager's item menus and a bookmark's preview: the Fetch Covers tool
 * (`TOOL_DEFINITIONS.covers`) run on exactly the bookmarks chosen, as its `selection` scope, with
 * the same review, site access (only those bookmarks' sites, `usePermissionGate`), Cover Source,
 * and hand-picked covers kept. The page renders `element`, which holds the review and the access
 * explanation.
 */
import { useRef } from 'react';

export function useCoverFetch(currentFolderId: string | null) {
  const { folders, refresh } = useBookmarks();
  const { settings } = useSettings();
  // The bookmarks the next run fetches, read when it starts (`listed('selection')`).
  const chosenIds = useRef<readonly string[]>([]);
  const environment: ToolEnvironment = {
    settings,
    folders,
    currentFolderId,
    refresh,
    saveFile: () => {
      throw new Error('Fetch Covers saves no file');
    },
    listing: { available: ['selection'], ids: () => chosenIds.current },
  };
  const tool = TOOL_DEFINITIONS.covers;
  const { state, run, apply, undo, close } = useToolRun(tool, environment);
  const access = usePermissionGate('webAccess');

  /** Fetches the covers of `bookmarks`, asking first for access to their sites. Call from a click. */
  const fetchCovers = (bookmarks: readonly Bookmark[]) => {
    chosenIds.current = bookmarks.map((bookmark) => bookmark.id);
    const urls = bookmarks.flatMap((bookmark) => (bookmark.url ? [bookmark.url] : []));
    void access.run(() => run('selection'), getUrlSites(urls));
  };

  const element = (
    <>
      <ToolReview
        tool={tool as ToolDefinitions[ToolId]}
        state={state as ToolRunState<ToolResults[ToolId]>}
        apply={apply as (selection: ToolSelections[ToolId]) => Promise<void>}
        undo={undo}
        close={close}
        environment={environment}
      />
      <PermissionDialog {...access.dialogProps} />
    </>
  );

  return { enabled: settings.coversEnabled, fetchCovers, element };
}
