/**
 * The popup, side panel, and manager search in the search query language (`search-query.ts`),
 * matched against every field (`search-documents.ts`). They load it on the first search, so pages
 * open without it; `bookmark-search.ts` keeps the tree helpers and the title search.
 */
import type { BookmarkTreeNode } from '@/types';

/** Calls back with the local tags and summaries once read, then after each change. */
export function observeSearchMetadata(
  callback: (metadata: StoredBookmarkMetadataById) => void,
): () => void {
  return bookmarkMetadataValue.observe(callback);
}

/** The last library searched and its documents, so typing reuses them (and their folded text). */
let searchedLibrary:
  | {
      nodes: readonly BookmarkTreeNode[];
      metadata: StoredBookmarkMetadataById;
      documents: readonly SearchDocument[];
    }
  | undefined;

function documentsOf(
  nodes: readonly BookmarkTreeNode[],
  metadata: StoredBookmarkMetadataById,
): readonly SearchDocument[] {
  if (searchedLibrary?.nodes !== nodes || searchedLibrary.metadata !== metadata) {
    searchedLibrary = { nodes, metadata, documents: buildSearchDocuments(nodes, metadata) };
  }
  return searchedLibrary.documents;
}

/**
 * The last query searched and what it found per document, so a tree update (a save, a move)
 * matches only the documents it replaced. Documents are rebuilt when their bookmark, folder path,
 * or tags and summary change (`buildSearchDocuments`), so a kept one has the same result.
 */
let searchedQuery:
  | {
      text: string;
      match: (document: SearchDocument) => SearchResult | undefined;
      results: WeakMap<SearchDocument, SearchResult | null>;
    }
  | undefined;

function resultOf(text: string, query: SearchQuery, document: SearchDocument) {
  if (searchedQuery?.text !== text) {
    searchedQuery = { text, match: compileSearchQuery(query), results: new WeakMap() };
  }
  let result = searchedQuery.results.get(document);
  if (result === undefined) {
    result = searchedQuery.match(document) ?? null;
    searchedQuery.results.set(document, result);
  }
  return result;
}

/** Whether a query names folders with `folder:`, so being in one is what it asks for. */
function asksForFolders(query: SearchQuery): boolean {
  return query.terms.some(
    (term) => term.kind === 'text' && term.field === 'folder' && !term.negate,
  );
}

/** Every document the query matches, by bookmark id; undefined when it has no terms. */
function matchQuery(
  nodes: readonly BookmarkTreeNode[],
  text: string,
  metadata: StoredBookmarkMetadataById,
): { query: SearchQuery; results: Map<string, SearchResult> } | undefined {
  const { query } = parseSearchQuery(text);
  if (query.terms.length === 0) return undefined;
  const results = new Map<string, SearchResult>();
  for (const document of documentsOf(nodes, metadata)) {
    const result = resultOf(text, query, document);
    if (result) results.set(document.id, result);
  }
  return { query, results };
}

/**
 * Whether a result matched only by its folder path, which a plain word naming a folder does for
 * everything in it. The folder is the match then, unless the query asks for folders (`folder:`).
 */
function matchesOnlyByFolder(query: SearchQuery, result: SearchResult): boolean {
  return !asksForFolders(query) && result.reasons.every((reason) => reason.field === 'folder');
}

/**
 * The tree filtered by a search box's query, read in the search query language and matched against
 * titles, addresses, folders, and the local tags and summaries in `metadata`.
 */
export function filterBookmarkTreeByQuery(
  nodes: readonly BookmarkTreeNode[],
  text: string,
  metadata: StoredBookmarkMetadataById,
): BookmarkTreeNode[] {
  const matched = matchQuery(nodes, text, metadata);
  if (!matched) return [...nodes];
  const { query, results } = matched;
  return filterTree(nodes, (node, insideMatch) => {
    const result = results.get(node.id);
    if (!result) return undefined;
    // The contents of a matching folder show beneath it unflagged, as before.
    if (insideMatch && matchesOnlyByFolder(query, result)) return undefined;
    const title = result.reasons.find((reason) => reason.field === 'title');
    return {
      isSearchMatch: true,
      searchMatchRanges: title?.ranges ?? [],
      searchMatchReasons: result.reasons,
    };
  });
}

/**
 * The ids of the bookmarks and folders a search box's query matches, for a flat list such as the
 * manager's table; undefined when the query has no terms, so it filters nothing. A folder a plain
 * word names is listed, not everything in it.
 */
export function matchBookmarkTreeQuery(
  nodes: readonly BookmarkTreeNode[],
  text: string,
  metadata: StoredBookmarkMetadataById,
): ReadonlySet<string> | undefined {
  const matched = matchQuery(nodes, text, metadata);
  if (!matched) return undefined;
  const ids = new Set<string>();
  for (const [id, result] of matched.results) {
    if (!matchesOnlyByFolder(matched.query, result)) ids.add(id);
  }
  return ids;
}
