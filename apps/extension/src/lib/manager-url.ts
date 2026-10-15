/**
 * The bookmark manager's address: `bookmarks.html?id=<folder>&q=<search>`. In Chrome and Edge the
 * page replaces the browser's own manager, so the same query works on chrome://bookmarks and
 * edge://favorites (the address bar keeps the address it was opened with; history entries still
 * change).
 *
 * - `id` is the open folder, an opaque bookmark id (numeric in Chrome and Edge, a GUID such as
 *   `toolbar_____` in Firefox). Chrome 154 to 156 wrote folder UUIDs there instead; the four fixed
 *   folders' UUIDs and Chrome's `account_heading` / `local_heading` still open the matching
 *   folder (`resolveManagerFolderAlias`), any other UUID shows the missing-folder notice.
 * - `q` is the title search, the manager's "Filter titles" box (the URL filter has its own box and
 *   is not in the address). A search wins over the folder: the table shows the matches from every
 *   folder unless "Current folder only" is checked, and `id` keeps the folder for that box and the
 *   tree.
 *
 * History entries use relative addresses, so they resolve against whichever address the page is
 * shown under.
 */
import { z } from 'zod';

const managerUrlConfig = readConfig(
  'ui/manager-url',
  z.strictObject({
    search_history_dwell_ms: z.number().int().nonnegative(),
    folder_link_base: z.record(z.string(), z.string().regex(/^[a-z][a-z0-9+.-]*:\/\/\S+\/$/)),
  }),
);

/** Query parameter of the open folder. */
export const MANAGER_FOLDER_PARAM = 'id';
/** Query parameter of the title search. */
export const MANAGER_SEARCH_PARAM = 'q';

/** What the address holds: the folder (null is the top level) and the title search. */
export type ManagerLocation = { folderId: string | null; query: string };

/** The folder and search in a query string such as `location.search`. */
export function readManagerLocation(search: string): ManagerLocation {
  const params = new URLSearchParams(search);
  return {
    folderId: params.get(MANAGER_FOLDER_PARAM) || null,
    query: params.get(MANAGER_SEARCH_PARAM) ?? '',
  };
}

/**
 * The relative address for `next`, keeping any other query parameters and the hash of `current`.
 * An empty query leaves the path alone, so the entry still points at the page.
 */
export function buildManagerHistoryUrl(
  current: Pick<Location, 'pathname' | 'search' | 'hash'>,
  next: ManagerLocation,
): string {
  const params = new URLSearchParams(current.search);
  if (next.folderId) params.set(MANAGER_FOLDER_PARAM, next.folderId);
  else params.delete(MANAGER_FOLDER_PARAM);
  if (next.query) params.set(MANAGER_SEARCH_PARAM, next.query);
  else params.delete(MANAGER_SEARCH_PARAM);
  const query = params.toString();
  return `${query ? `?${query}` : current.pathname}${current.hash}`;
}

export type HistoryWrite = 'push' | 'replace';

/**
 * Decides how each search change is written to history, as Chrome's manager does: a change that
 * follows the previous one within the dwell time replaces its entry, and the first change after a
 * pause adds one. Typing a word is one Back step, and Back from it returns to the folder.
 */
export function createSearchHistoryDwell(
  dwellMs: number = managerUrlConfig.search_history_dwell_ms,
  now: () => number = () => performance.now(),
): () => HistoryWrite {
  let lastChange = Number.NEGATIVE_INFINITY;
  return () => {
    const time = now();
    const write: HistoryWrite = time - lastChange < dwellMs ? 'replace' : 'push';
    lastChange = time;
    return write;
  };
}

/** Folder UUIDs Chrome 154 to 156 wrote into `?id=`, by `folderType`; null is the top level. */
const FIXED_FOLDER_UUIDS: Readonly<Record<string, string | null>> = {
  '0bc5d13f-2cba-5d74-951f-3f233fe6c908': 'bookmarks-bar',
  '82b081ec-3dd3-529c-8475-ab6c344590dd': 'other',
  '4cf2e351-0e85-532b-bb37-df045d8f8d0f': 'mobile',
  '2509a7dc-215d-52f7-a429-8d80431c6c75': null,
};

/** Chrome's account and device headings, which this manager shows as the top level. */
const HEADING_IDS: ReadonlySet<string> = new Set(['account_heading', 'local_heading']);

/** A top-level folder as the browser reports it. */
export type PermanentFolderIdentity = { id: string; folderType?: string; syncing?: boolean };

/**
 * The folder a Chrome-only folder id stands for: a fixed folder's UUID becomes that folder's id
 * (the synced copy when the account and the device each have one), and a heading or the root's
 * UUID becomes null, the top level. Undefined when `requestedId` is an ordinary id, or names a
 * folder this browser does not have.
 */
export function resolveManagerFolderAlias(
  requestedId: string,
  permanentFolders: readonly PermanentFolderIdentity[],
): string | null | undefined {
  if (HEADING_IDS.has(requestedId)) return null;
  const key = requestedId.toLowerCase();
  if (!Object.hasOwn(FIXED_FOLDER_UUIDS, key)) return undefined;
  const folderType = FIXED_FOLDER_UUIDS[key];
  if (folderType === null) return null;
  const matches = permanentFolders.filter((folder) => folder.folderType === folderType);
  return (matches.find((folder) => folder.syncing) ?? matches[0])?.id;
}

/**
 * The address "Copy link to this folder" copies: the browser's own manager address where this page
 * replaces it (`chrome://bookmarks/?id=12`), otherwise `extensionPageUrl` (Firefox). The top
 * level has no `id`.
 */
export function getManagerFolderLink(
  folderId: string | null,
  browser: string,
  extensionPageUrl: string,
): string {
  const base = managerUrlConfig.folder_link_base[browser] ?? extensionPageUrl;
  return folderId ? `${base}?${new URLSearchParams({ [MANAGER_FOLDER_PARAM]: folderId })}` : base;
}

/**
 * The manager's tab title: the search, or the open folder's name, before the page's usual title
 * ("Work - Bookmarks - Bookmark Scout"). The top level has the usual title alone.
 */
export function getManagerPageTitle(folderName: string | undefined, query: string): string {
  const pageTitle = getExtensionPageTitle('page_bookmarks');
  const search = query.trim();
  if (search) return t('page_managerSearchTitle', [search, pageTitle]);
  if (folderName) return t('page_managerFolderTitle', [folderName, pageTitle]);
  return pageTitle;
}
