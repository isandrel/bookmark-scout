/**
 * Matches a search query (`search-query.ts`) against the library: each bookmark and folder as a
 * `SearchDocument` built from the tree and the local tags and summaries
 * (`bookmark-metadata-storage.ts`), read only, never written back.
 *
 * Text compares without case (each character lowercased on its own, so `İ` and `ß` keep their
 * place), with accents and width kept as typed; tags compare by `tagKey`, the way tags are stored.
 * Highlight ranges are offsets into the original text, in UTF-16 units, so they stay right for
 * emoji, accents, and characters whose lowercase is longer. The root and the browser's own folders
 * (Bookmarks bar, Other bookmarks) are containers and never results; Firefox separators are not
 * searched.
 */
import type { BookmarkTreeNode } from '@/types';

export type SearchDocument = {
  id: string;
  kind: 'bookmark' | 'folder';
  title: string;
  url?: string;
  /** The site's host name, lowercase, without `www.`; empty for folders and unreadable URLs. */
  host: string;
  /** The names of the folders the item is in, outermost first, below the browser's own folders. */
  folders: readonly string[];
  /** The folder path as shown: `folders` joined with `FOLDER_PATH_SEPARATOR`. */
  folderPath: string;
  dateAdded?: number;
  tags: readonly string[];
  summary?: string;
  /** The page's indexed text (`page-text-store.ts`), when it was read from this address. */
  content?: string;
};

export type SearchMatchField =
  | 'title'
  | 'url'
  | 'domain'
  | 'folder'
  | 'tag'
  | 'summary'
  | 'content';

/**
 * Where a document matched; `ranges` are highlights in that field's text, `[start, end)` in UTF-16
 * units.
 */
export type SearchMatchReason =
  | { field: Exclude<SearchMatchField, 'tag' | 'content'>; ranges: SearchMatchRange[] }
  /** `value` is the tag, and `ranges` are in it. */
  | { field: 'tag'; value: string; ranges: SearchMatchRange[] }
  /** `snippet` is the page text around the first match, as plain text. */
  | { field: 'content'; snippet: string; ranges: SearchMatchRange[] };

export type SearchResult = {
  document: SearchDocument;
  score: number;
  reasons: SearchMatchReason[];
};

/**
 * Text without case, and where each of its characters came from. Lowercasing all but a few
 * characters keeps the length, and then offsets are the same (`origin` unset); a text where it does
 * not (`İ` becomes two code units) is mapped one code point at a time.
 */
type Folded = { text: string; origin?: number[] };

function fold(text: string): Folded {
  const lower = text.toLowerCase();
  if (lower.length === text.length) return { text: lower };
  let folded = '';
  const origin: number[] = [];
  let index = 0;
  for (const character of text) {
    const part = character.toLowerCase();
    for (let unit = 0; unit < part.length; unit += 1) origin.push(index);
    folded += part;
    index += character.length;
  }
  origin.push(index);
  return { text: folded, origin };
}

/** Every place `needle` is in `haystack`, as ranges of the original text. */
function findAll(haystack: Folded, needle: string): SearchMatchRange[] {
  const ranges: SearchMatchRange[] = [];
  if (!needle) return ranges;
  const original = (at: number) => haystack.origin?.[at] ?? at;
  for (let at = haystack.text.indexOf(needle); at !== -1; ) {
    const end = at + needle.length;
    ranges.push([original(at), original(end)]);
    at = haystack.text.indexOf(needle, end);
  }
  return ranges;
}

/** A document's text without case, worked out once, the first time a search reads it. */
type FoldedDocument = {
  title: Folded;
  url?: Folded;
  folderPath: Folded;
  folders: readonly string[];
  summary?: Folded;
  content?: Folded;
  tags: readonly Folded[];
  tagKeys: readonly string[];
};

const foldedDocuments = new WeakMap<SearchDocument, FoldedDocument>();

function foldedOf(document: SearchDocument): FoldedDocument {
  let folded = foldedDocuments.get(document);
  if (!folded) {
    folded = {
      title: fold(document.title),
      ...(document.url ? { url: fold(document.url) } : {}),
      folderPath: fold(document.folderPath),
      folders: document.folders.map((name) => name.toLowerCase()),
      ...(document.summary ? { summary: fold(document.summary) } : {}),
      ...(document.content ? { content: fold(document.content) } : {}),
      tags: document.tags.map(fold),
      tagKeys: document.tags.map(tagKey),
    };
    foldedDocuments.set(document, folded);
  }
  return folded;
}

/** A node's last document, with the metadata entry and page text it was built from. */
type BuiltDocument = {
  document: SearchDocument;
  own: StoredBookmarkMetadata | undefined;
  content: string | undefined;
};

/** Indexed page text by bookmark id, with the address it was read from. */
export type SearchPageTexts = ReadonlyMap<string, { url: string; text: string }>;

const NO_PAGE_TEXTS: SearchPageTexts = new Map();

/**
 * The document last built for each node. Tree updates replace only the nodes that changed
 * (`bookmark-tree-changes.ts`), so after a save or a move the rest keep their documents and the
 * text already folded for them.
 */
const builtDocuments = new WeakMap<BookmarkTreeNode, BuiltDocument>();

function sameNames(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((name, index) => name === right[index]);
}

function documentOf(
  node: BookmarkTreeNode,
  folders: readonly string[],
  own: StoredBookmarkMetadata | undefined,
  page: { url: string; text: string } | undefined,
): SearchDocument {
  // Text read from another address is not this bookmark's page any more.
  const content = page && page.url === node.url && page.text ? page.text : undefined;
  const built = builtDocuments.get(node);
  if (
    built &&
    built.own === own &&
    built.content === content &&
    sameNames(built.document.folders, folders)
  ) {
    return built.document;
  }
  const isFolder = Boolean(node.children);
  const document: SearchDocument = {
    id: node.id,
    kind: isFolder ? 'folder' : 'bookmark',
    title: node.title,
    ...(node.url ? { url: node.url } : {}),
    host: isFolder ? '' : withoutWww(getUrlHostname(node.url)),
    folders,
    folderPath: folders.join(FOLDER_PATH_SEPARATOR),
    ...(node.dateAdded !== undefined ? { dateAdded: node.dateAdded } : {}),
    tags: own?.tags ?? [],
    ...(own?.summary ? { summary: own.summary } : {}),
    ...(content ? { content } : {}),
  };
  builtDocuments.set(node, { document, own, content });
  return document;
}

/**
 * The documents for a tree, keyed to the local metadata by bookmark id, one at a time, so a page
 * can build them in slices while idle (`bookmark-query-filter.lazy.ts`).
 */
export function* searchDocumentsOf(
  roots: readonly BookmarkTreeNode[],
  metadata: StoredBookmarkMetadataById,
  pageTexts: SearchPageTexts = NO_PAGE_TEXTS,
): Generator<SearchDocument, void, undefined> {
  // Depth first in tree order, without recursion: a generator per level would cost a frame each.
  const stack: { node: BookmarkTreeNode; folders: readonly string[]; container: boolean }[] = [];
  for (let index = roots.length - 1; index >= 0; index -= 1) {
    const root = roots[index];
    if (root) stack.push({ node: root, folders: [], container: true });
  }
  for (let entry = stack.pop(); entry; entry = stack.pop()) {
    const { node, folders, container } = entry;
    if (!container && !isSeparatorNode(node)) {
      yield documentOf(node, folders, metadata[node.id], pageTexts.get(node.id));
    }
    if (!node.children) continue;
    const inside = container ? folders : [...folders, node.title];
    // The root's children are the browser's own folders: containers too.
    const childContainer = isBookmarkTreeRoot(node);
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];
      if (child) stack.push({ node: child, folders: inside, container: childContainer });
    }
  }
}

/** Builds the documents for a tree, keyed to the local metadata by bookmark id. */
export function buildSearchDocuments(
  roots: readonly BookmarkTreeNode[],
  metadata: StoredBookmarkMetadataById,
  pageTexts: SearchPageTexts = NO_PAGE_TEXTS,
): SearchDocument[] {
  return Array.from(searchDocumentsOf(roots, metadata, pageTexts));
}

/** Works out a document's text without case ahead of the first search that reads it. */
export function foldSearchDocument(document: SearchDocument): void {
  foldedOf(document);
}

const ELLIPSIS = '…';

/** The text around a match, on one line, at most `SEARCH_CONTENT_SNIPPET_CHARS` long. */
function snippetAround(text: string, range: SearchMatchRange | undefined): string {
  const [start = 0, end = 0] = range ?? [];
  const room = Math.max(0, SEARCH_CONTENT_SNIPPET_CHARS - (end - start));
  const from = Math.max(0, start - Math.floor(room / 2));
  const to = Math.min(text.length, from + SEARCH_CONTENT_SNIPPET_CHARS);
  const body = text.slice(from, to).replace(/\s+/g, ' ').trim();
  return `${from > 0 ? ELLIPSIS : ''}${body}${to < text.length ? ELLIPSIS : ''}`;
}

/** A host name as typed, made comparable to `SearchDocument.host` (punycode, no `www.`). */
function domainOf(value: string): string {
  try {
    return withoutWww(new URL(`http://${value}`).hostname.replace(/\.$/, ''));
  } catch {
    return withoutWww(value.toLowerCase());
  }
}

/** The local midnight starting `day` (`YYYY-MM-DD`), plus `days` days; DST-safe. */
function localDayStart(day: string, days = 0): number {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return new Date(year, month - 1, date + days).getTime();
}

/** A text term with what every document is compared to worked out once per search. */
type CompiledText = {
  kind: 'text';
  term: SearchTerm & { kind: 'text' };
  needle: string;
  tagKey: string;
  domain: string;
  /** For `folder:`, the folder names it lists, without case. */
  folders: readonly string[];
};
type CompiledTerm =
  | CompiledText
  | { kind: 'condition'; term: Exclude<SearchTerm, { kind: 'text' }> };

function compileTerm(term: SearchTerm): CompiledTerm {
  if (term.kind !== 'text') return { kind: 'condition', term };
  return {
    kind: 'text',
    term,
    needle: term.value.toLowerCase(),
    tagKey: tagKey(term.value),
    domain: term.field === 'domain' ? domainOf(term.value) : '',
    folders:
      term.field === 'folder'
        ? term.value
            .split(FOLDER_PATH_SEPARATOR.trim())
            .map((name) => name.trim().toLowerCase())
            .filter(Boolean)
        : [],
  };
}

type TermMatch = { matched: boolean; score: number; reasons: SearchMatchReason[] };

/** Where a text term matches in one document, and its best weight. */
function matchText(document: SearchDocument, compiled: CompiledText): TermMatch {
  const { term, needle } = compiled;
  const folded = foldedOf(document);
  const reasons: SearchMatchReason[] = [];
  let score = 0;
  const wants = (name: SearchMatchField) => term.field === undefined || term.field === name;
  const add = (reason: SearchMatchReason, weight: number) => {
    reasons.push(reason);
    score = Math.max(score, weight);
  };

  if (wants('title') && folded.title.text.includes(needle)) {
    const weight =
      folded.title.text === needle
        ? SEARCH_WEIGHTS.title_exact
        : folded.title.text.startsWith(needle)
          ? SEARCH_WEIGHTS.title_prefix
          : SEARCH_WEIGHTS.title;
    add({ field: 'title', ranges: findAll(folded.title, needle) }, weight);
  }
  if (wants('tag')) {
    document.tags.forEach((tag, index) => {
      // `tag:` names a whole tag; a plain word may be part of one.
      if (term.field === 'tag') {
        if (folded.tagKeys[index] === compiled.tagKey) {
          add({ field: 'tag', value: tag, ranges: [[0, tag.length]] }, SEARCH_WEIGHTS.tag);
        }
        return;
      }
      const text = folded.tags[index];
      if (text?.text.includes(needle)) {
        add({ field: 'tag', value: tag, ranges: findAll(text, needle) }, SEARCH_WEIGHTS.tag);
      }
    });
  }
  if (wants('folder') && document.folders.length > 0) {
    const ranges =
      term.field === 'folder'
        ? matchFolderNames(document, folded, compiled.folders)
        : folded.folderPath.text.includes(needle)
          ? findAll(folded.folderPath, needle)
          : [];
    if (ranges.length > 0) add({ field: 'folder', ranges }, SEARCH_WEIGHTS.folder);
  }
  if (term.field === 'domain') {
    if (document.host && hostnameMatchesDomain(document.host, compiled.domain)) {
      add({ field: 'domain', ranges: [] }, SEARCH_WEIGHTS.domain);
    }
  } else if (wants('url') && folded.url?.text.includes(needle)) {
    const weight = document.host.includes(needle) ? SEARCH_WEIGHTS.domain : SEARCH_WEIGHTS.url;
    add({ field: 'url', ranges: findAll(folded.url, needle) }, weight);
  }
  if (wants('summary') && folded.summary?.text.includes(needle)) {
    add({ field: 'summary', ranges: findAll(folded.summary, needle) }, SEARCH_WEIGHTS.summary);
  }
  if (wants('content') && document.content && folded.content?.text.includes(needle)) {
    const ranges = findAll(folded.content, needle);
    add(
      { field: 'content', snippet: snippetAround(document.content, ranges[0]), ranges },
      SEARCH_WEIGHTS.content,
    );
  }
  return { matched: reasons.length > 0, score, reasons };
}

/**
 * `folder:` names folders the item is in, whole names separated by `FOLDER_PATH_SEPARATOR` (any
 * depth, its contents included); the range covers them in `folderPath`.
 */
function matchFolderNames(
  document: SearchDocument,
  folded: FoldedDocument,
  wanted: readonly string[],
): SearchMatchRange[] {
  if (wanted.length === 0) return [];
  for (let start = 0; start + wanted.length <= folded.folders.length; start += 1) {
    if (wanted.every((name, offset) => folded.folders[start + offset] === name)) {
      const before = document.folders.slice(0, start).join(FOLDER_PATH_SEPARATOR);
      const names = document.folders
        .slice(start, start + wanted.length)
        .join(FOLDER_PATH_SEPARATOR);
      const from = before ? before.length + FOLDER_PATH_SEPARATOR.length : 0;
      return [[from, from + names.length]];
    }
  }
  return [];
}

/** Whether a condition (`is:`, `has:`, a date) holds for a document. */
function holds(term: Exclude<SearchTerm, { kind: 'text' }>, document: SearchDocument): boolean {
  if (term.kind === 'is') {
    return term.value === 'untagged'
      ? document.kind === 'bookmark' && document.tags.length === 0
      : document.kind === term.value;
  }
  if (term.kind === 'has') {
    if (term.value === 'summary') return Boolean(document.summary);
    if (term.value === 'content') return Boolean(document.content);
    return document.tags.length > 0;
  }
  if (document.dateAdded === undefined) return false;
  return term.bound === 'after'
    ? document.dateAdded >= localDayStart(term.day)
    : document.dateAdded < localDayStart(term.day, 1);
}

function matchCompiled(
  document: SearchDocument,
  terms: readonly CompiledTerm[],
): SearchResult | undefined {
  let score = 0;
  const reasons: SearchMatchReason[] = [];
  for (const compiled of terms) {
    const match =
      compiled.kind === 'text'
        ? matchText(document, compiled)
        : { matched: holds(compiled.term, document), score: 0, reasons: [] };
    if (match.matched === compiled.term.negate) return undefined;
    if (compiled.term.negate) continue;
    score += match.score;
    reasons.push(...match.reasons);
  }
  return { document, score, reasons: mergeReasons(reasons) };
}

/** A query read once, to match documents one at a time: undefined for one that does not match. */
export function compileSearchQuery(
  query: SearchQuery,
): (document: SearchDocument) => SearchResult | undefined {
  const terms = query.terms.map(compileTerm);
  return (document) => matchCompiled(document, terms);
}

/** One document against a query: undefined when it does not match. An empty query matches all. */
export function matchSearchDocument(
  document: SearchDocument,
  query: SearchQuery,
): SearchResult | undefined {
  return compileSearchQuery(query)(document);
}

/** One reason per field (and tag), with its ranges in order and overlaps joined. */
function mergeReasons(reasons: readonly SearchMatchReason[]): SearchMatchReason[] {
  const byField = new Map<string, SearchMatchReason>();
  for (const reason of reasons) {
    const key = reason.field === 'tag' ? `tag\u0000${reason.value}` : reason.field;
    const existing = byField.get(key);
    byField.set(
      key,
      existing ? { ...existing, ranges: [...existing.ranges, ...reason.ranges] } : reason,
    );
  }
  return [...byField.values()].map((reason) => ({ ...reason, ranges: joinRanges(reason.ranges) }));
}

function joinRanges(ranges: readonly SearchMatchRange[]): SearchMatchRange[] {
  const sorted = [...ranges].sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const joined: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = joined.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else joined.push([start, end]);
  }
  return joined;
}

/**
 * The documents matching a query, best first. Equal scores keep the documents' own order (the
 * library's), and an empty query keeps every document in that order.
 */
export function searchDocuments(
  documents: readonly SearchDocument[],
  query: SearchQuery,
): SearchResult[] {
  const match = compileSearchQuery(query);
  const results: { result: SearchResult; order: number }[] = [];
  documents.forEach((document, order) => {
    const result = match(document);
    if (result) results.push({ result, order });
  });
  results.sort((left, right) => right.result.score - left.result.score || left.order - right.order);
  return results.map(({ result }) => result);
}
