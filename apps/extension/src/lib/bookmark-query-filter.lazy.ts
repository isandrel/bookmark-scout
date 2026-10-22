/**
 * The popup and side panel search in the search query language (`search-query.ts`), matched
 * against every field (`search-documents.ts`). The store loads it on the first search, so pages
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

/**
 * The tree filtered by a search box's query, read in the search query language and matched against
 * titles, addresses, folders, and the local tags and summaries in `metadata`.
 */
export function filterBookmarkTreeByQuery(
  nodes: readonly BookmarkTreeNode[],
  text: string,
  metadata: StoredBookmarkMetadataById,
): BookmarkTreeNode[] {
  const { query } = parseSearchQuery(text);
  if (query.terms.length === 0) return [...nodes];
  const results = new Map<string, SearchResult>();
  for (const document of documentsOf(nodes, metadata)) {
    const result = resultOf(text, query, document);
    if (result) results.set(document.id, result);
  }
  const folderMatches = asksForFolders(query);
  return filterTree(nodes, (node, insideMatch) => {
    const result = results.get(node.id);
    if (!result) return undefined;
    // A plain word that names a matching folder matches everything in it by its folder path;
    // the folder is the match, and its contents show beneath it unflagged, as before.
    if (
      insideMatch &&
      !folderMatches &&
      result.reasons.every((reason) => reason.field === 'folder')
    ) {
      return undefined;
    }
    const title = result.reasons.find((reason) => reason.field === 'title');
    return {
      isSearchMatch: true,
      searchMatchRanges: title?.ranges ?? [],
      searchMatchReasons: result.reasons,
    };
  });
}
