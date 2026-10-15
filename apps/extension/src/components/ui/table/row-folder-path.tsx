import { createContext, useContext } from 'react';

/**
 * Whether row titles show their folder: while the table lists matches from every folder (a
 * search or filter not limited to the folder shown) and no folder column is visible, so that
 * identical bookmarks in different folders can be told apart.
 */
export const RowFolderPathContext = createContext(false);

/** A row's folder path on a muted line under its title, when `RowFolderPathContext` asks. */
export function RowFolderPath({ path }: { path: string }) {
  const show = useContext(RowFolderPathContext);
  if (!show || !path) return null;
  return (
    <span className="flex min-w-0 text-xs text-muted-foreground" data-slot="row-folder-path">
      <PathLabel path={path} />
    </span>
  );
}
