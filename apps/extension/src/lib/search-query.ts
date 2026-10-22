/**
 * The search query language every search box shares, read into a versioned tree of terms
 * (`parseSearchQuery`) and written back (`serializeSearchQuery`). `search-documents.ts` matches
 * the tree against bookmarks.
 *
 * - Plain words must all match, each anywhere: title, address, site, folder path, tags, or
 *   summary. `"two words"` is one phrase. `-word` excludes.
 * - `title:`, `url:`, `domain:`, `folder:` (or `path:`), `tag:`, and `summary:` look in one place;
 *   `title:"two words"` takes a phrase. `-tag:old` excludes.
 * - `is:bookmark`, `is:folder`, `is:untagged`, `has:summary`, `has:tags`.
 * - `after:2026-01-31` and `before:2026-01-31` take local calendar days, both inclusive.
 * - `a OR b` (the word in capitals, between two terms) needs one of them. OR binds closer than
 *   the space, so `x a OR b` is `x` and (`a` or `b`). Parentheses group terms:
 *   `domain:github.com (tag:react OR tag:vue) -tag:archived`, and `-(…)` excludes a group.
 *
 * Anything else stays plain text, so old queries keep working: an address such as
 * `https://example.com/a:b`, `C++`, `10:30`, a lowercase `or`, or parentheses inside a word
 * (`f(x)`, `wiki/Foo_(bar)`). A parenthesis groups only at the edge of a word: `(` at its start
 * (after `-` for an excluded group) and a `)` at its end that closes no `(` in the word. An unknown
 * operator (`foo:bar`), an invalid date, an unclosed quote or parenthesis, an OR with nothing on
 * one side, or a query past the limits in `config/bookmarks/search.toml` (length, terms, nesting,
 * terms one OR joins) is reported in `diagnostics` and never throws. Reading is one pass over the
 * words with nesting bounded by `max_group_depth`, and matching one pass over the tree, so a query
 * costs at most `max_terms` term checks per bookmark. Regular expressions stay a separate option.
 */
import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';

const searchConfig = readConfig(
  'bookmarks/search',
  z.strictObject({
    max_query_length: boundedNumber({ integer: true }),
    max_terms: boundedNumber({ integer: true }),
    max_group_depth: boundedNumber({ integer: true }),
    max_or_branches: boundedNumber({ integer: true }),
    content_snippet_chars: z.number().int().positive(),
    weights: z.strictObject({
      title_exact: z.number().positive(),
      title_prefix: z.number().positive(),
      title: z.number().positive(),
      tag: z.number().positive(),
      folder: z.number().positive(),
      domain: z.number().positive(),
      url: z.number().positive(),
      summary: z.number().positive(),
      content: z.number().positive(),
    }),
  }),
);

/** How much a match counts, by where it was (`search-documents.ts`). */
export const SEARCH_WEIGHTS = searchConfig.weights;

/** Characters of page text a match in it shows (`search-documents.ts`). */
export const SEARCH_CONTENT_SNIPPET_CHARS = searchConfig.content_snippet_chars;

/**
 * What each version of the language reads, by the version saved with a query. A version is added
 * when a query could read differently: version 2 added OR and parentheses, so `cats OR dogs` and
 * `(draft)` meant other things in version 1 (three words; the text "(draft)").
 */
const SYNTAX_VERSIONS = {
  1: { grouping: false },
  2: { grouping: true },
} as const satisfies Record<number, { grouping: boolean }>;

export type SearchSyntaxVersion = keyof typeof SYNTAX_VERSIONS;

/**
 * The version written with a saved query. Raising it keeps every saved query: smart rules and
 * saved searches accept any version in `SEARCH_SYNTAX_VERSIONS` and are rewritten to this one as
 * they are read (`upgradeSearchText`), so a rule saved before OR existed keeps finding exactly what
 * it found. Accepting only the newest version would drop every stored rule instead.
 */
export const SEARCH_SYNTAX_VERSION = 2 satisfies SearchSyntaxVersion;

/** Every version a stored query may name, oldest first. */
export const SEARCH_SYNTAX_VERSIONS = Object.keys(SYNTAX_VERSIONS).map(
  Number,
) as SearchSyntaxVersion[];

/** A version a stored query names, read as is; `upgradeSearchText` brings its text up to date. */
export const searchSyntaxVersionSchema = z.literal(SEARCH_SYNTAX_VERSIONS);

/** The places a term can be limited to, by operator name. `path:` is another name for `folder:`. */
const FIELD_OPERATORS = {
  title: 'title',
  url: 'url',
  domain: 'domain',
  folder: 'folder',
  path: 'folder',
  tag: 'tag',
  summary: 'summary',
  content: 'content',
} as const;
export type SearchField = (typeof FIELD_OPERATORS)[keyof typeof FIELD_OPERATORS];

const IS_VALUES = ['bookmark', 'folder', 'untagged'] as const;
const HAS_VALUES = ['summary', 'tags', 'content'] as const;
const DATE_OPERATORS = ['after', 'before'] as const;

export type SearchTerm =
  | { kind: 'text'; value: string; phrase: boolean; negate: boolean; field?: SearchField }
  | { kind: 'is'; value: (typeof IS_VALUES)[number]; negate: boolean }
  | { kind: 'has'; value: (typeof HAS_VALUES)[number]; negate: boolean }
  | { kind: 'date'; bound: (typeof DATE_OPERATORS)[number]; day: string; negate: boolean };

/**
 * A term, or terms combined: `all` is a group in parentheses whose terms must all match, `any` is
 * terms joined by OR, one of which must match. `negate` excludes what the whole node matches. A
 * group of one term is that term, so `(a)` reads as `a` and `-(-a)` as `a`.
 */
export type SearchNode =
  | SearchTerm
  | { kind: 'all'; nodes: SearchNode[]; negate: boolean }
  | { kind: 'any'; branches: SearchNode[]; negate: boolean };

/** `terms` must all match; a query without OR or parentheses is a flat list of terms. */
export type SearchQuery = { syntaxVersion: SearchSyntaxVersion; terms: SearchNode[] };

export type SearchQueryDiagnostic =
  | { code: 'unknown-operator'; operator: string }
  | { code: 'unknown-value'; operator: string; value: string }
  | { code: 'invalid-date'; value: string }
  | { code: 'unclosed-quote' }
  | { code: 'unclosed-group' }
  | { code: 'unopened-group' }
  | { code: 'empty-group' }
  | { code: 'misplaced-or' }
  | { code: 'too-long'; limit: number }
  | { code: 'too-many-terms'; limit: number }
  | { code: 'too-deep'; limit: number }
  | { code: 'too-many-branches'; limit: number };

export type ParsedSearchQuery = { query: SearchQuery; diagnostics: SearchQueryDiagnostic[] };

const QUOTE = '"';
const NEGATION = '-';
const OPERATOR_SEPARATOR = ':';
const OPEN_GROUP = '(';
const CLOSE_GROUP = ')';
/** Joins alternatives; only in capitals and as a word of its own, so `or` stays text. */
const OR = 'OR';
/** An operator name: letters only, so `C++:`, `10:30`, and IPv6 addresses stay plain text. */
const OPERATOR_NAME = /^[a-z]+$/i;
/** `YYYY-MM-DD`. */
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const WHITESPACE = /\s/u;

/** One whitespace-separated piece of the query, with whether any of it was quoted. */
type RawToken = { text: string; quoted: boolean; quoteStart: number };

/** A word, or (with grouping) a parenthesis or OR. */
type Token =
  | { kind: 'word'; raw: RawToken }
  | { kind: 'open'; negate: boolean }
  | { kind: 'close' }
  | { kind: 'or' };

/**
 * Parentheses in a word's unquoted text: `inner` is how many `(` in it are still open, and
 * `closers` how many `)` at its end close none of them, so they close groups.
 */
type WordParentheses = { inner: number; closers: number };

function trackParenthesis(state: WordParentheses, character: string): void {
  if (character === CLOSE_GROUP) {
    if (state.inner > 0) state.inner -= 1;
    else state.closers += 1;
    return;
  }
  // Anything after a `)` keeps it in the word, as in `a)b`.
  state.closers = 0;
  if (character === OPEN_GROUP) state.inner += 1;
}

/** How many `)` at the end of `text`, unquoted, would close groups. */
function closingParentheses(text: string): number {
  const state: WordParentheses = { inner: 0, closers: 0 };
  for (const character of text) trackParenthesis(state, character);
  return state.closers;
}

/**
 * Splits on whitespace outside quotes; a quote opens and closes anywhere in a token. With
 * `grouping`, an unquoted `(` starting a word (or `-(`) opens a group, `)`s ending it that close
 * no `(` in it close groups, and a lone unquoted `OR` joins alternatives.
 */
function tokenize(input: string, grouping: boolean, diagnostics: SearchQueryDiagnostic[]): Token[] {
  const tokens: Token[] = [];
  let text = '';
  let quoted = false;
  let inQuote = false;
  let quoteStart = -1;
  let parentheses: WordParentheses = { inner: 0, closers: 0 };
  const push = () => {
    const closers = grouping ? parentheses.closers : 0;
    const word = text.slice(0, text.length - closers);
    if (grouping && !quoted && word === OR) tokens.push({ kind: 'or' });
    else if (word || quoted) tokens.push({ kind: 'word', raw: { text: word, quoted, quoteStart } });
    for (let index = 0; index < closers; index += 1) tokens.push({ kind: 'close' });
    text = '';
    quoted = false;
    quoteStart = -1;
    parentheses = { inner: 0, closers: 0 };
  };
  for (const character of input) {
    if (character === QUOTE) {
      if (!inQuote && quoteStart === -1) quoteStart = text.length;
      inQuote = !inQuote;
      quoted = true;
      parentheses.closers = 0;
    } else if (inQuote) {
      text += character;
    } else if (WHITESPACE.test(character)) {
      push();
    } else if (
      grouping &&
      character === OPEN_GROUP &&
      !quoted &&
      (text === '' || text === NEGATION)
    ) {
      tokens.push({ kind: 'open', negate: text === NEGATION });
      text = '';
    } else {
      text += character;
      if (grouping) trackParenthesis(parentheses, character);
    }
  }
  if (inQuote) diagnostics.push({ code: 'unclosed-quote' });
  push();
  return tokens;
}

/** A local calendar day that exists (`2026-02-30` does not). */
function isDay(value: string): boolean {
  const match = DAY.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year ?? 0, (month ?? 0) - 1, day ?? 0);
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day;
}

function isOneOf<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}

function readToken(token: RawToken, diagnostics: SearchQueryDiagnostic[]): SearchTerm | undefined {
  let text = token.text;
  let quoteStart = token.quoteStart;
  // A dash before anything but a quote negates; a lone `-` is text.
  const negate = text.length > 1 && text.startsWith(NEGATION) && quoteStart !== 0;
  if (negate) {
    text = text.slice(NEGATION.length);
    if (quoteStart !== -1) quoteStart -= NEGATION.length;
  }
  const plain = (value: string): SearchTerm => ({
    kind: 'text',
    value,
    phrase: token.quoted,
    negate,
  });

  const separator = text.indexOf(OPERATOR_SEPARATOR);
  // An operator is a name before the first colon, outside quotes, with a value after it.
  const quotedBeforeSeparator = quoteStart !== -1 && quoteStart <= separator;
  if (separator <= 0 || quotedBeforeSeparator) return text ? plain(text) : undefined;
  const name = text.slice(0, separator).toLowerCase();
  const value = text.slice(separator + OPERATOR_SEPARATOR.length);
  if (!OPERATOR_NAME.test(name) || !value || value.startsWith('//')) {
    return plain(text);
  }

  if (name in FIELD_OPERATORS) {
    const field = FIELD_OPERATORS[name as keyof typeof FIELD_OPERATORS];
    return { kind: 'text', value, phrase: token.quoted, negate, field };
  }
  const known = value.toLowerCase();
  if (name === 'is' && isOneOf(IS_VALUES, known)) return { kind: 'is', value: known, negate };
  if (name === 'has' && isOneOf(HAS_VALUES, known)) return { kind: 'has', value: known, negate };
  if (name === 'is' || name === 'has') {
    diagnostics.push({ code: 'unknown-value', operator: name, value });
    return undefined;
  }
  if (isOneOf(DATE_OPERATORS, name)) {
    if (isDay(value)) return { kind: 'date', bound: name, day: value, negate };
    diagnostics.push({ code: 'invalid-date', value });
    return undefined;
  }
  diagnostics.push({ code: 'unknown-operator', operator: name });
  return plain(text);
}

/**
 * Reading the tokens into a tree, left to right in one pass. `stopped` is set at the first limit
 * reached; what was read before it stays, and the rest is ignored.
 */
type Reader = {
  tokens: readonly Token[];
  at: number;
  terms: number;
  stopped: boolean;
  diagnostics: SearchQueryDiagnostic[];
};

function stop(reader: Reader, diagnostic: SearchQueryDiagnostic): undefined {
  reader.diagnostics.push(diagnostic);
  reader.stopped = true;
  return undefined;
}

/** A group's nodes as one node: a single node stays itself, with the group's sign added. */
function groupOf(nodes: SearchNode[], negate: boolean): SearchNode {
  const [only] = nodes;
  if (nodes.length === 1 && only) return { ...only, negate: only.negate !== negate };
  return { kind: 'all', nodes, negate };
}

/** A term or a group in parentheses. */
function readUnit(reader: Reader, depth: number): SearchNode | undefined {
  const token = reader.tokens[reader.at];
  reader.at += 1;
  if (!token || token.kind === 'close' || token.kind === 'or') return undefined;
  if (token.kind === 'word') {
    const term = readToken(token.raw, reader.diagnostics);
    if (!term) return undefined;
    if (reader.terms === searchConfig.max_terms) {
      return stop(reader, { code: 'too-many-terms', limit: searchConfig.max_terms });
    }
    reader.terms += 1;
    return term;
  }
  if (depth === searchConfig.max_group_depth) {
    return stop(reader, { code: 'too-deep', limit: searchConfig.max_group_depth });
  }
  const start = reader.at;
  const nodes = readSequence(reader, depth + 1);
  const read = reader.at > start;
  if (!reader.stopped) {
    if (reader.tokens[reader.at]?.kind === 'close') {
      reader.at += 1;
      // A group whose terms were all left out has said why already.
      if (!read) reader.diagnostics.push({ code: 'empty-group' });
    } else {
      reader.diagnostics.push({ code: 'unclosed-group' });
    }
  }
  return nodes.length > 0 ? groupOf(nodes, token.negate) : undefined;
}

/** A unit, and the units OR joins to it. */
function readAlternatives(reader: Reader, depth: number): SearchNode | undefined {
  const branches: SearchNode[] = [];
  const first = readUnit(reader, depth);
  if (first) branches.push(first);
  while (!reader.stopped && reader.tokens[reader.at]?.kind === 'or') {
    reader.at += 1;
    const next = reader.tokens[reader.at];
    if (!next || next.kind === 'close' || next.kind === 'or') {
      reader.diagnostics.push({ code: 'misplaced-or' });
      continue;
    }
    if (branches.length === searchConfig.max_or_branches) {
      stop(reader, { code: 'too-many-branches', limit: searchConfig.max_or_branches });
      break;
    }
    const branch = readUnit(reader, depth);
    if (branch) branches.push(branch);
  }
  if (branches.length > 1) return { kind: 'any', branches, negate: false };
  return branches[0];
}

/** Nodes that must all match, up to the `)` that ends the group at `depth` (left unread). */
function readSequence(reader: Reader, depth: number): SearchNode[] {
  const nodes: SearchNode[] = [];
  while (!reader.stopped && reader.at < reader.tokens.length) {
    const token = reader.tokens[reader.at];
    if (token?.kind === 'close') {
      if (depth > 0) break;
      reader.diagnostics.push({ code: 'unopened-group' });
      reader.at += 1;
    } else if (token?.kind === 'or') {
      reader.diagnostics.push({ code: 'misplaced-or' });
      reader.at += 1;
    } else {
      const node = readAlternatives(reader, depth);
      if (node) nodes.push(node);
    }
  }
  return nodes;
}

/**
 * Reads a query typed in a search box, or saved in `syntaxVersion` of the language. Never throws;
 * problems are in `diagnostics`.
 */
export function parseSearchQuery(
  input: string,
  syntaxVersion: SearchSyntaxVersion = SEARCH_SYNTAX_VERSION,
): ParsedSearchQuery {
  const diagnostics: SearchQueryDiagnostic[] = [];
  let text = input;
  if (text.length > searchConfig.max_query_length) {
    diagnostics.push({ code: 'too-long', limit: searchConfig.max_query_length });
    text = text.slice(0, searchConfig.max_query_length);
  }
  const { grouping } = SYNTAX_VERSIONS[syntaxVersion];
  const reader: Reader = {
    tokens: tokenize(text, grouping, diagnostics),
    at: 0,
    terms: 0,
    stopped: false,
    diagnostics,
  };
  const terms = readSequence(reader, 0);
  return { query: { syntaxVersion, terms }, diagnostics };
}

/**
 * Writes a value back, quoted when it has a space, a quote mark, or was a phrase, or when it would
 * read as OR or a parenthesis (a value read in version 1, such as `(draft)`).
 */
function quote(value: string, phrase: boolean, field: boolean): string {
  const needsQuotes =
    phrase ||
    [...value].some((character) => WHITESPACE.test(character)) ||
    (!field && (value === OR || value.startsWith(OPEN_GROUP))) ||
    closingParentheses(value) > 0;
  return needsQuotes ? `${QUOTE}${value.replaceAll(QUOTE, '')}${QUOTE}` : value;
}

/** The query as text that `parseSearchQuery` reads back into the same terms. */
function serializeTerm(term: SearchTerm): string {
  const sign = term.negate ? NEGATION : '';
  if (term.kind === 'is' || term.kind === 'has') {
    return `${sign}${term.kind}${OPERATOR_SEPARATOR}${term.value}`;
  }
  if (term.kind === 'date') return `${sign}${term.bound}${OPERATOR_SEPARATOR}${term.day}`;
  const field = term.field ? `${term.field}${OPERATOR_SEPARATOR}` : '';
  return `${sign}${field}${quote(term.value, term.phrase, term.field !== undefined)}`;
}

/** A node as text; alternatives inside alternatives, or excluded, keep their parentheses. */
function serializeNode(node: SearchNode, inAlternatives: boolean): string {
  const sign = node.negate ? NEGATION : '';
  if (node.kind === 'all') {
    const body = node.nodes.map((child) => serializeNode(child, false)).join(' ');
    return `${sign}${OPEN_GROUP}${body}${CLOSE_GROUP}`;
  }
  if (node.kind === 'any') {
    const body = node.branches.map((branch) => serializeNode(branch, true)).join(` ${OR} `);
    return node.negate || inAlternatives ? `${sign}${OPEN_GROUP}${body}${CLOSE_GROUP}` : body;
  }
  return serializeTerm(node);
}

/** The query as text, in the current version of the language. */
export function serializeSearchQuery(query: SearchQuery): string {
  return query.terms.map((node) => serializeNode(node, false)).join(' ');
}

/**
 * A query saved in `syntaxVersion`, as text the current version reads into the same terms. Text
 * that reads the same either way is kept as typed; the rest is written back from what the old
 * version read (`(draft)` becomes `"(draft)"`).
 */
export function upgradeSearchText(text: string, syntaxVersion: SearchSyntaxVersion): string {
  if (syntaxVersion === SEARCH_SYNTAX_VERSION) return text;
  const before = parseSearchQuery(text, syntaxVersion);
  const now = parseSearchQuery(text);
  const same =
    isSameJson(before.query.terms, now.query.terms) &&
    isSameJson(before.diagnostics, now.diagnostics);
  return same ? text : serializeSearchQuery(before.query);
}

/** Whether the query uses an operator, so it is a search and never a folder name to save into. */
export function hasSearchOperators(query: SearchQuery): boolean {
  return query.terms.some((term) => term.kind !== 'text' || term.field !== undefined);
}

/**
 * Every term in a query, with whether it excludes once the groups around it count: in
 * `-(a -b)`, `a` excludes and `b` does not.
 */
export function* searchQueryTerms(
  nodes: readonly SearchNode[],
  excluded = false,
): Generator<{ term: SearchTerm; excludes: boolean }, void, undefined> {
  for (const node of nodes) {
    const excludes = excluded !== node.negate;
    if (node.kind === 'all') yield* searchQueryTerms(node.nodes, excludes);
    else if (node.kind === 'any') yield* searchQueryTerms(node.branches, excludes);
    else yield { term: node, excludes };
  }
}

/** Whether a query looks in page text (`content:` or `has:content`), which Index Page Text keeps. */
export function searchesPageText(query: SearchQuery): boolean {
  for (const { term } of searchQueryTerms(query.terms)) {
    if (term.kind === 'text' && term.field === 'content') return true;
    if (term.kind === 'has' && term.value === 'content') return true;
  }
  return false;
}
