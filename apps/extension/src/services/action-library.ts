/**
 * The bookmark library as the actions (`actions.ts`) see it: every bookmark and folder
 * with a typed reference (`b:<id>`, `f:<id>`) and its full folder path. Paths are folder titles
 * joined with `AI_FOLDER_PATH_SEPARATOR`, the same in every tool, so a path or reference one tool
 * returns can be passed to another. Folders are named by reference or by path, and a path that
 * fits several folders, or none, comes back with candidates instead of a guess.
 *
 * No React and no AI SDK: the background runs these tools for local agents too.
 */
import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';

/** A bookmark as tools return it. */
export const actionBookmarkSchema = z.object({
  ref: z.string().describe('Bookmark reference, b:<id>'),
  title: z.string(),
  url: z.string(),
  host: z.string(),
  folder: z.string().describe('Full path of the folder it is in'),
  folderRef: z.string().describe('Folder reference, f:<id>'),
  added: z.string().optional().describe('Date added, YYYY-MM-DD'),
  tags: z.array(z.string()).optional(),
  summary: z.string().optional(),
});

export type ActionBookmark = z.infer<typeof actionBookmarkSchema>;

/** A folder as tools return it. */
export const actionFolderSchema = z.object({
  ref: z.string().describe('Folder reference, f:<id>'),
  path: z.string(),
  bookmarks: z.number().int().optional().describe('Bookmarks directly inside'),
  folders: z.number().int().optional().describe('Folders directly inside'),
  managed: z.boolean().optional().describe('Managed by the browser or a policy; cannot change'),
});

export type ActionFolder = z.infer<typeof actionFolderSchema>;

/** One bookmark in the library, with what the tools search and show. */
export type LibraryBookmark = {
  node: BookmarkTreeNode;
  folder: LibraryFolder;
  host: string;
  metadata: StoredBookmarkMetadata;
};

/** One folder in the library. Permanent folders are included; the invisible root is not. */
export type LibraryFolder = {
  node: BookmarkTreeNode;
  path: string;
  /** Levels from the top: a permanent folder such as the bookmarks bar is 1. */
  depth: number;
  parent?: LibraryFolder;
};

export type ActionLibrary = {
  tree: BookmarkTreeNode[];
  bookmarks: LibraryBookmark[];
  /** In tree order, parents before their children. */
  folders: LibraryFolder[];
  bookmarkById: ReadonlyMap<string, LibraryBookmark>;
  folderById: ReadonlyMap<string, LibraryFolder>;
};

const REF_PREFIXES = { bookmark: 'b:', folder: 'f:' } as const;

export type ActionRefKind = keyof typeof REF_PREFIXES;

export function toBookmarkRef(id: string): string {
  return `${REF_PREFIXES.bookmark}${id}`;
}

export function toFolderRef(id: string): string {
  return `${REF_PREFIXES.folder}${id}`;
}

/** The kind and browser id a reference names, or undefined when it is not a reference. */
export function parseActionRef(ref: string): { kind: ActionRefKind; id: string } | undefined {
  const value = ref.trim();
  for (const [kind, prefix] of Object.entries(REF_PREFIXES) as [ActionRefKind, string][]) {
    if (value.startsWith(prefix) && value.length > prefix.length) {
      return { kind, id: value.slice(prefix.length) };
    }
  }
  return undefined;
}

/** Indexes a bookmark tree with the stored tags and summaries. */
export function indexActionLibrary(
  tree: BookmarkTreeNode[],
  metadata: StoredBookmarkMetadataById,
): ActionLibrary {
  const bookmarks: LibraryBookmark[] = [];
  const folders: LibraryFolder[] = [];
  const visit = (node: BookmarkTreeNode, parent: LibraryFolder | undefined) => {
    if (node.url) {
      if (parent) {
        bookmarks.push({
          node,
          folder: parent,
          host: getUrlHostname(node.url),
          metadata: metadata[node.id] ?? {},
        });
      }
      return;
    }
    if (isBookmarkTreeRoot(node)) {
      for (const child of node.children ?? []) visit(child, undefined);
      return;
    }
    const title = getBookmarkDisplayTitle(node.title);
    const folder: LibraryFolder = {
      node,
      path: parent ? `${parent.path}${AI_FOLDER_PATH_SEPARATOR}${title}` : title,
      depth: (parent?.depth ?? 0) + 1,
      ...(parent ? { parent } : {}),
    };
    folders.push(folder);
    for (const child of node.children ?? []) visit(child, folder);
  };
  for (const node of tree) visit(node, undefined);
  return {
    tree,
    bookmarks,
    folders,
    bookmarkById: new Map(bookmarks.map((bookmark) => [bookmark.node.id, bookmark])),
    folderById: new Map(folders.map((folder) => [folder.node.id, folder])),
  };
}

/** Reads the whole library once, for one tool call. */
export async function loadActionLibrary(): Promise<ActionLibrary> {
  return indexActionLibrary(await fetchBookmarkTree(), await bookmarkMetadataValue.get());
}

function isoDate(time: number | undefined): string | undefined {
  return time ? new Date(time).toISOString().slice(0, 10) : undefined;
}

/** A bookmark as tools return it; `summaryChars` adds its saved summary, cut to that length. */
export function toActionBookmark(
  bookmark: LibraryBookmark,
  { summaryChars }: { summaryChars?: number } = {},
): ActionBookmark {
  const { node, folder, metadata } = bookmark;
  const added = isoDate(node.dateAdded);
  return {
    ref: toBookmarkRef(node.id),
    title: node.title,
    url: node.url ?? '',
    host: bookmark.host,
    folder: folder.path,
    folderRef: toFolderRef(folder.node.id),
    ...(added ? { added } : {}),
    ...(metadata.tags?.length ? { tags: metadata.tags } : {}),
    ...(summaryChars && metadata.summary
      ? { summary: truncateText(metadata.summary, summaryChars) }
      : {}),
  };
}

export function toActionFolder(
  folder: LibraryFolder,
  { counts }: { counts: boolean },
): ActionFolder {
  const children = folder.node.children ?? [];
  return {
    ref: toFolderRef(folder.node.id),
    path: folder.path,
    ...(counts
      ? {
          bookmarks: children.filter((child) => child.url).length,
          folders: children.filter((child) => !child.url).length,
        }
      : {}),
    ...(folder.node.unmodifiable ? { managed: true } : {}),
  };
}

/** A path compared without case and without spaces around its separators. */
function comparablePath(path: string): string {
  return path
    .split(AI_FOLDER_PATH_SEPARATOR)
    .map((segment) => segment.trim().toLocaleLowerCase())
    .filter(Boolean)
    .join(AI_FOLDER_PATH_SEPARATOR);
}

/**
 * Folders a path names: those whose full path it is, else those whose path ends with it (a folder
 * name, or its last few levels). Titles may contain the separator ("CI/CD"); whole paths are
 * compared, so that still matches.
 */
export function findFoldersByPath(library: ActionLibrary, path: string): LibraryFolder[] {
  const wanted = comparablePath(path);
  if (!wanted) return [];
  const paths = library.folders.map((folder) => comparablePath(folder.path));
  const exact = library.folders.filter((_, index) => paths[index] === wanted);
  if (exact.length > 0) return exact;
  const suffix = `${AI_FOLDER_PATH_SEPARATOR}${wanted}`;
  return library.folders.filter((_, index) => paths[index].endsWith(suffix));
}

/** Folders whose own name contains the last part of `path`, for "did you mean" candidates. */
export function findSimilarFolders(library: ActionLibrary, path: string): LibraryFolder[] {
  const last = comparablePath(path).split(AI_FOLDER_PATH_SEPARATOR).at(-1);
  if (!last) return [];
  return library.folders.filter((folder) =>
    getBookmarkDisplayTitle(folder.node.title).toLocaleLowerCase().includes(last),
  );
}

/** Whether `folder` is `ancestor` or inside it. */
export function isInFolder(folder: LibraryFolder, ancestor: LibraryFolder): boolean {
  for (let at: LibraryFolder | undefined = folder; at; at = at.parent) {
    if (at === ancestor) return true;
  }
  return false;
}
