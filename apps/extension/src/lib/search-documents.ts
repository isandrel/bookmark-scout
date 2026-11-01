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
  /**
   * The page's indexed text (`page-text-store.ts`), when it was read from this address: one
   * block (a paragraph, heading, or list item) per line, so a match never spans two of them.
   */
  content?: string;
  /**
   * How `content` was captured (`PageTextProvenance`), so a result says where its text came
   * from; absent for text indexed before that was kept.
   */
  contentSource?: PageTextSource;
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
  /**
   * `snippet` is the page text around the first match, as plain text; `source`, how that text
   * was captured, when known.
   */
  | { field: 'content'; snippet: string; ranges: SearchMatchRange[]; source?: PageTextSource };

export type SearchResult = {
  document: SearchDocument;
  score: number;
  reasons: SearchMatchReason[];
};

// Bookmark text compares without case only; accents and width stay as typed (`text-match.ts`).
const BOOKMARK_TEXT_FOLD: TextFoldRules = {
  ignoreCase: true,
  ignoreAccents: false,
  ignoreWidth: false,
};

const fold = (text: string): FoldedText => foldText(text, BOOKMARK_TEXT_FOLD);

/** A document's text without case, worked out once, the first time a search reads it. */
type FoldedDocument = {
  title: FoldedText;
  url?: FoldedText;
  folderPath: FoldedText;
  folders: readonly string[];
  summary?: FoldedText;
  content?: FoldedText;
  tags: readonly FoldedText[];
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
  contentSource: PageTextSource | undefined;
};

/** One bookmark's indexed page text: the address it was read for, and how it was captured. */
export type SearchPageText = { url: string; text: string; source?: PageTextSource };

/** Indexed page text by bookmark id. */
export type SearchPageTexts = ReadonlyMap<string, SearchPageText>;

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
  page: SearchPageText | undefined,
): SearchDocument {
  // Text read from another address is not this bookmark's page any more.
  const content = page && page.url === node.url && page.text ? page.text : undefined;
  const contentSource = content ? page?.source : undefined;
  const built = builtDocuments.get(node);
  if (
    built &&
    built.own === own &&
    built.content === content &&
    built.contentSource === contentSource &&
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
    ...(contentSource ? { contentSource } : {}),
  };
  builtDocuments.set(node, { document, own, content, contentSource });
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

/** What separates the blocks of page text (`extractReadableBlocks`). */
const BLOCK_BREAK = '\n';

/**
 * The text around a match, at most `SEARCH_CONTENT_SNIPPET_CHARS` long and inside the block
 * (paragraph) the match is in, so it reads as one passage.
 */
function snippetAround(text: string, range: SearchMatchRange | undefined): string {
  const [start = 0, end = 0] = range ?? [];
  const blockStart = text.lastIndexOf(BLOCK_BREAK, start - 1) + 1;
  const blockBreak = text.indexOf(BLOCK_BREAK, end);
  const blockEnd = blockBreak === -1 ? text.length : blockBreak;
  const room = Math.max(0, SEARCH_CONTENT_SNIPPET_CHARS - (end - start));
  const from = Math.max(blockStart, start - Math.floor(room / 2));
  const to = Math.min(blockEnd, from + SEARCH_CONTENT_SNIPPET_CHARS);
  const body = text.slice(from, to).replace(/\s+/g, ' ').trim();
  return `${from > blockStart ? ELLIPSIS : ''}${body}${to < blockEnd ? ELLIPSIS : ''}`;
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
  /**
   * The needle for page text: its whitespace as single spaces, which never stand for a block
   * break there, so a phrase matches inside one paragraph only.
   */
  contentNeedle: string;
  tagKey: string;
  domain: string;
  /**
   * For `folder:`, the ways to read it as folder names, without case: split at each `/`, split
   * only at a spaced ` / ` (as paths are shown), and the whole value as one name, so a folder
   * named `CI/CD` is found too. The item matches when any of them names folders it is in.
   */
  folders: readonly (readonly string[])[];
};
/** A query's tree with each term worked out once: `all` and `any` as in `SearchNode`. */
type CompiledNode =
  | CompiledText
  | { kind: 'condition'; term: Exclude<SearchTerm, { kind: 'text' }> }
  | { kind: 'all'; nodes: CompiledNode[]; negate: boolean }
  | { kind: 'any'; branches: CompiledNode[]; negate: boolean };

function compileNode(node: SearchNode): CompiledNode {
  if (node.kind === 'all') {
    return { kind: 'all', nodes: node.nodes.map(compileNode), negate: node.negate };
  }
  if (node.kind === 'any') {
    return { kind: 'any', branches: node.branches.map(compileNode), negate: node.negate };
  }
  return compileTerm(node);
}

function compileTerm(term: SearchTerm): CompiledNode {
  if (term.kind !== 'text') return { kind: 'condition', term };
  return {
    kind: 'text',
    term,
    needle: term.value.toLowerCase(),
    contentNeedle: term.value.toLowerCase().replace(/\s+/gu, ' '),
    tagKey: tagKey(term.value),
    domain: term.field === 'domain' ? domainOf(term.value) : '',
    folders: term.field === 'folder' ? folderReadings(term.value) : [],
  };
}

/** The ways a `folder:` value can name folders (`CompiledText.folders`), each once. */
function folderReadings(value: string): (readonly string[])[] {
  const namesOf = (parts: readonly string[]) =>
    parts.map((name) => name.trim().toLowerCase()).filter(Boolean);
  const readings = [
    namesOf(value.split(FOLDER_PATH_SEPARATOR.trim())),
    namesOf(value.split(FOLDER_PATH_SEPARATOR)),
    namesOf([value]),
  ].filter((names) => names.length > 0);
  return readings.filter(
    (names, index) => readings.findIndex((other) => sameNames(other, names)) === index,
  );
}

type TermMatch = { matched: boolean; score: number; reasons: SearchMatchReason[] };

/** A run of letters, combining marks, and digits: one word of a field's text. */
const TEXT_WORD = /[\p{L}\p{M}\p{N}]+/gu;

/**
 * The words of `folded` within `budget` edits of `needle` (Damerau-Levenshtein), as ranges in
 * the original text, and the fewest edits any of them took; none when no word is close enough.
 */
function fuzzyWordRanges(
  folded: FoldedText,
  needle: string,
  budget: number,
): { ranges: SearchMatchRange[]; edits: number } {
  const ranges: SearchMatchRange[] = [];
  let fewest = budget + 1;
  for (const match of folded.text.matchAll(TEXT_WORD)) {
    const edits = editDistanceWithin(needle, match[0], budget);
    if (edits > budget) continue;
    const at = match.index ?? 0;
    const last = at + match[0].length - 1;
    ranges.push([folded.starts?.[at] ?? at, folded.ends?.[last] ?? last + 1]);
    fewest = Math.min(fewest, edits);
  }
  return { ranges, edits: fewest };
}

/**
 * Where a plain word, found nowhere as typed, matches a word spelled a little differently (Search
 * Matching's Fuzzy Matching): in the title, a tag, a folder name, or the summary, each weighed as
 * its field is and less for each edit. Addresses and page text are left out, where near spellings
 * are mostly noise.
 */
function matchFuzzy(
  document: SearchDocument,
  compiled: CompiledText,
  matching: SearchMatching,
): TermMatch {
  const { needle } = compiled;
  const budget = /\s/u.test(needle) ? 0 : fuzzyBudget(needle.length, matching);
  if (budget === 0) return NO_MATCH;
  const folded = foldedOf(document);
  const reasons: SearchMatchReason[] = [];
  let score = 0;
  const add = (reason: SearchMatchReason, weight: number, edits: number) => {
    reasons.push(reason);
    score = Math.max(score, (weight * FUZZY_MATCH_WEIGHT) / 2 ** (edits - 1));
  };
  const title = fuzzyWordRanges(folded.title, needle, budget);
  if (title.ranges.length > 0)
    add({ field: 'title', ranges: title.ranges }, SEARCH_WEIGHTS.title, title.edits);
  document.tags.forEach((tag, index) => {
    const text = folded.tags[index];
    const found = text ? fuzzyWordRanges(text, needle, budget) : undefined;
    if (found?.ranges.length)
      add({ field: 'tag', value: tag, ranges: found.ranges }, SEARCH_WEIGHTS.tag, found.edits);
  });
  if (document.folders.length > 0) {
    const found = fuzzyWordRanges(folded.folderPath, needle, budget);
    if (found.ranges.length > 0)
      add({ field: 'folder', ranges: found.ranges }, SEARCH_WEIGHTS.folder, found.edits);
  }
  if (folded.summary) {
    const found = fuzzyWordRanges(folded.summary, needle, budget);
    if (found.ranges.length > 0)
      add({ field: 'summary', ranges: found.ranges }, SEARCH_WEIGHTS.summary, found.edits);
  }
  return reasons.length > 0 ? { matched: true, score, reasons } : NO_MATCH;
}

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
    add({ field: 'title', ranges: findFoldedRanges(folded.title, needle) }, weight);
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
        add(
          { field: 'tag', value: tag, ranges: findFoldedRanges(text, needle) },
          SEARCH_WEIGHTS.tag,
        );
      }
    });
  }
  if (wants('folder') && document.folders.length > 0) {
    const ranges =
      term.field === 'folder'
        ? matchFolderReadings(document, folded, compiled.folders)
        : folded.folderPath.text.includes(needle)
          ? findFoldedRanges(folded.folderPath, needle)
          : [];
    if (ranges.length > 0) add({ field: 'folder', ranges }, SEARCH_WEIGHTS.folder);
  }
  if (term.field === 'domain') {
    if (document.host && hostnameMatchesDomain(document.host, compiled.domain)) {
      add({ field: 'domain', ranges: [] }, SEARCH_WEIGHTS.domain);
    }
  } else if (wants('url') && folded.url?.text.includes(needle)) {
    const weight = document.host.includes(needle) ? SEARCH_WEIGHTS.domain : SEARCH_WEIGHTS.url;
    add({ field: 'url', ranges: findFoldedRanges(folded.url, needle) }, weight);
  }
  if (wants('summary') && folded.summary?.text.includes(needle)) {
    add(
      { field: 'summary', ranges: findFoldedRanges(folded.summary, needle) },
      SEARCH_WEIGHTS.summary,
    );
  }
  const { contentNeedle } = compiled;
  if (wants('content') && document.content && folded.content?.text.includes(contentNeedle)) {
    const ranges = findFoldedRanges(folded.content, contentNeedle);
    const { contentSource: source } = document;
    add(
      {
        field: 'content',
        snippet: snippetAround(document.content, ranges[0]),
        ranges,
        ...(source ? { source } : {}),
      },
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

/** `matchFolderNames` for the first reading of a `folder:` value that matches. */
function matchFolderReadings(
  document: SearchDocument,
  folded: FoldedDocument,
  readings: readonly (readonly string[])[],
): SearchMatchRange[] {
  for (const wanted of readings) {
    const ranges = matchFolderNames(document, folded, wanted);
    if (ranges.length > 0) return ranges;
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

const NO_MATCH: TermMatch = { matched: false, score: 0, reasons: [] };
/** What an excluded node that does not match gives: a pass, with nothing to show for it. */
const EXCLUDED: TermMatch = { matched: true, score: 0, reasons: [] };

/** Whether a node excludes what it matches (`-word`, `-(…)`). */
function excludes(node: CompiledNode): boolean {
  return node.kind === 'text' || node.kind === 'condition' ? node.term.negate : node.negate;
}

/** Nodes that must all match: their scores add up, and the first that fails ends the check. */
function matchAll(
  document: SearchDocument,
  nodes: readonly CompiledNode[],
  matching: SearchMatching | undefined,
): TermMatch {
  let score = 0;
  const reasons: SearchMatchReason[] = [];
  for (const node of nodes) {
    const match = matchNode(document, node, matching);
    if (!match.matched) return NO_MATCH;
    score += match.score;
    reasons.push(...match.reasons);
  }
  return { matched: true, score, reasons };
}

/**
 * Alternatives, one of which must match. Every branch is checked, in order, so the score adds up
 * the branches that match and the reasons are theirs only: a term in a branch that does not match
 * is never a reason.
 */
function matchAny(
  document: SearchDocument,
  branches: readonly CompiledNode[],
  matching: SearchMatching | undefined,
): TermMatch {
  let matched = false;
  let score = 0;
  const reasons: SearchMatchReason[] = [];
  for (const branch of branches) {
    const match = matchNode(document, branch, matching);
    if (!match.matched) continue;
    matched = true;
    score += match.score;
    reasons.push(...match.reasons);
  }
  return matched ? { matched, score, reasons } : NO_MATCH;
}

/**
 * A node against a document, its exclusion applied: an excluded node never gives reasons. A plain
 * word found nowhere as typed may match a near spelling when `matching` allows it; a word
 * excluded with `-` never does, so it excludes only what it names.
 */
function matchNode(
  document: SearchDocument,
  node: CompiledNode,
  matching: SearchMatching | undefined,
): TermMatch {
  const plain = (text: CompiledText) => {
    const exact = matchText(document, text);
    if (exact.matched || !matching || text.term.field !== undefined || text.term.negate) {
      return exact;
    }
    return matchFuzzy(document, text, matching);
  };
  const match =
    node.kind === 'text'
      ? plain(node)
      : node.kind === 'condition'
        ? { matched: holds(node.term, document), score: 0, reasons: [] }
        : node.kind === 'all'
          ? matchAll(document, node.nodes, matching)
          : matchAny(document, node.branches, matching);
  if (!excludes(node)) return match;
  return match.matched ? NO_MATCH : EXCLUDED;
}

/**
 * A query read once, to match documents one at a time: undefined for one that does not match.
 * With `matching` (a search box's or AI's search), plain words also match near spellings as
 * Search Matching says; without it (Smart Rules), only what is typed matches.
 */
export function compileSearchQuery(
  query: SearchQuery,
  matching?: SearchMatching,
): (document: SearchDocument) => SearchResult | undefined {
  const nodes = query.terms.map(compileNode);
  return (document) => {
    const match = matchAll(document, nodes, matching);
    if (!match.matched) return undefined;
    return { document, score: match.score, reasons: mergeReasons(match.reasons) };
  };
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
