/**
 * The popup, side panel, and manager search in the search query language (`search-query.ts`),
 * matched against every field (`search-documents.ts`). They load it on the first search, so pages
 * open without it; `bookmark-search.ts` keeps the tree helpers and the title search.
 */
import type { BookmarkTreeNode } from '@/types';

/**
 * The indexed page text search reads (`page-text-store.ts`): none while Index Page Text is off,
 * so turning it off takes page text out of every search at once.
 */
let searchedPageTexts: SearchPageTexts = new Map();

/**
 * Calls back with the local tags and summaries once read, then after each change to them, to the
 * indexed page text, or to whether Index Page Text is on.
 */
export function observeSearchMetadata(
  callback: (metadata: StoredBookmarkMetadataById) => void,
): () => void {
  let metadata: StoredBookmarkMetadataById | undefined;
  let pageTextOn: boolean | undefined;
  let reading = 0;
  const readPageTexts = async () => {
    reading += 1;
    const read = reading;
    const pages = pageTextOn ? await getPageTexts() : new Map<string, PageTextRecord>();
    if (read !== reading) return;
    searchedPageTexts = new Map(
      [...pages].map(([id, page]) => [
        id,
        {
          url: page.url,
          text: page.text,
          ...(page.provenance ? { source: page.provenance.source } : {}),
        },
      ]),
    );
    if (metadata) callback(metadata);
  };
  const stopMetadata = bookmarkMetadataValue.observe((next) => {
    metadata = next;
    callback(next);
  });
  const stopSettings = settingsValue.observe((settings) => {
    if (settings.pageTextEnabled === pageTextOn) return;
    pageTextOn = settings.pageTextEnabled;
    void readPageTexts();
  });
  const stopPageTexts = watchPageTexts(() => void readPageTexts());
  return () => {
    stopMetadata();
    stopSettings();
    stopPageTexts();
  };
}

/** The last library searched and its documents, so typing reuses them (and their folded text). */
let searchedLibrary:
  | {
      nodes: readonly BookmarkTreeNode[];
      metadata: StoredBookmarkMetadataById;
      pageTexts: SearchPageTexts;
      documents: readonly SearchDocument[];
    }
  | undefined;

function documentsOf(
  nodes: readonly BookmarkTreeNode[],
  metadata: StoredBookmarkMetadataById,
): readonly SearchDocument[] {
  const pageTexts = searchedPageTexts;
  if (
    searchedLibrary?.nodes !== nodes ||
    searchedLibrary.metadata !== metadata ||
    searchedLibrary.pageTexts !== pageTexts
  ) {
    searchedLibrary = {
      nodes,
      metadata,
      pageTexts,
      documents: buildSearchDocuments(nodes, metadata, pageTexts),
    };
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

/**
 * Whether a query names folders with `folder:`, so being in one is what it asks for; in an OR or a
 * group too, unless that excludes it.
 */
function asksForFolders(query: SearchQuery): boolean {
  return [...searchQueryTerms(query.terms)].some(
    ({ term, excludes }) => term.kind === 'text' && term.field === 'folder' && !excludes,
  );
}

/**
 * A term that needs its text to appear somewhere (a plain word or phrase, or one limited to the
 * title, address, or summary), so more characters typed on it can only match fewer documents.
 * Exclusions, whole-name operators (`tag:`, `folder:`, `domain:`), and conditions do not.
 */
function needsText(term: SearchNode): term is SearchTerm & { kind: 'text' } {
  return (
    term.kind === 'text' &&
    !term.negate &&
    (term.field === undefined ||
      term.field === 'title' ||
      term.field === 'url' ||
      term.field === 'summary')
  );
}

/**
 * Whether `next` can only match documents `previous` matched: typing on, it keeps every term of
 * `previous`, may lengthen the last one, and may add more (all terms must match). Terms in an OR
 * or a group are not compared, so typing on in one checks the whole library again.
 */
function narrows(previous: SearchQuery, next: SearchQuery): boolean {
  const last = previous.terms.length - 1;
  if (last < 0 || next.terms.length < previous.terms.length) return false;
  return previous.terms.every((term, index) => {
    const following = next.terms[index];
    if (!needsText(term) || !following || !needsText(following)) return false;
    if (term.field !== following.field || term.phrase !== following.phrase) return false;
    return index === last
      ? following.value.toLowerCase().startsWith(term.value.toLowerCase())
      : following.value === term.value;
  });
}

/**
 * The last query matched over a library and the documents it found, so typing on checks only
 * those (`narrows`) instead of the whole library.
 */
let lastMatch:
  | { documents: readonly SearchDocument[]; query: SearchQuery; found: SearchDocument[] }
  | undefined;

/** Every document the query matches, by bookmark id; undefined when it has no terms. */
function matchQuery(
  nodes: readonly BookmarkTreeNode[],
  text: string,
  metadata: StoredBookmarkMetadataById,
): { query: SearchQuery; results: Map<string, SearchResult> } | undefined {
  const { query } = parseSearchQuery(text);
  if (query.terms.length === 0) return undefined;
  const documents = documentsOf(nodes, metadata);
  const candidates =
    lastMatch?.documents === documents && narrows(lastMatch.query, query)
      ? lastMatch.found
      : documents;
  const results = new Map<string, SearchResult>();
  const found: SearchDocument[] = [];
  for (const document of candidates) {
    const result = resultOf(text, query, document);
    if (!result) continue;
    results.set(document.id, result);
    found.push(document);
  }
  lastMatch = { documents, query, found };
  return { query, results };
}

/** Documents being built ahead of the first search, for the library they belong to. */
let preparing:
  | {
      nodes: readonly BookmarkTreeNode[];
      metadata: StoredBookmarkMetadataById;
      pageTexts: SearchPageTexts;
      pending: Iterator<SearchDocument>;
      documents: SearchDocument[];
    }
  | undefined;

/**
 * Builds and folds a library's search documents ahead of the first search, a slice at a time:
 * it stops when `shouldYield` says so and goes on from there on the next call. True once they
 * are ready, so the first keystroke only matches.
 */
export function prepareSearchDocuments(
  nodes: readonly BookmarkTreeNode[],
  metadata: StoredBookmarkMetadataById,
  shouldYield: () => boolean,
): boolean {
  const pageTexts = searchedPageTexts;
  if (
    searchedLibrary?.nodes === nodes &&
    searchedLibrary.metadata === metadata &&
    searchedLibrary.pageTexts === pageTexts
  ) {
    return true;
  }
  if (
    preparing?.nodes !== nodes ||
    preparing.metadata !== metadata ||
    preparing.pageTexts !== pageTexts
  ) {
    preparing = {
      nodes,
      metadata,
      pageTexts,
      pending: searchDocumentsOf(nodes, metadata, pageTexts),
      documents: [],
    };
  }
  while (!shouldYield()) {
    const next = preparing.pending.next();
    if (next.done) {
      searchedLibrary = { nodes, metadata, pageTexts, documents: preparing.documents };
      preparing = undefined;
      return true;
    }
    foldSearchDocument(next.value);
    preparing.documents.push(next.value);
  }
  return false;
}

/**
 * Whether a result matched only by its folder path, which a plain word naming a folder does for
 * everything in it. The folder is the match then, unless the query asks for folders (`folder:`).
 * A result with no reasons at all matched by conditions (`is:`, `has:`, a date) or exclusions
 * alone, which hold for the item itself, so it is a match of its own.
 */
function matchesOnlyByFolder(query: SearchQuery, result: SearchResult): boolean {
  return (
    !asksForFolders(query) &&
    result.reasons.length > 0 &&
    result.reasons.every((reason) => reason.field === 'folder')
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
 * The bookmarks and folders a search box's query matches, with where each matched, for a flat list
 * such as the manager's table; undefined when the query has no terms, so it filters nothing. A folder a plain
 * word names is listed, not everything in it.
 */
export function matchBookmarkTreeQuery(
  nodes: readonly BookmarkTreeNode[],
  text: string,
  metadata: StoredBookmarkMetadataById,
): ReadonlyMap<string, readonly SearchMatchReason[]> | undefined {
  const matched = matchQuery(nodes, text, metadata);
  if (!matched) return undefined;
  const reasons = new Map<string, readonly SearchMatchReason[]>();
  for (const [id, result] of matched.results) {
    if (!matchesOnlyByFolder(matched.query, result)) reasons.set(id, result.reasons);
  }
  return reasons;
}
