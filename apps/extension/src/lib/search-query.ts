/**
 * The search query language every search box shares, read into a versioned tree of terms
 * (`parseSearchQuery`) and written back (`serializeSearchQuery`). `search-documents.ts` matches
 * the terms against bookmarks.
 *
 * - Plain words must all match, each anywhere: title, address, site, folder path, tags, or
 *   summary. `"two words"` is one phrase. `-word` excludes.
 * - `title:`, `url:`, `domain:`, `folder:` (or `path:`), `tag:`, and `summary:` look in one place;
 *   `title:"two words"` takes a phrase. `-tag:old` excludes.
 * - `is:bookmark`, `is:folder`, `is:untagged`, `has:summary`, `has:tags`.
 * - `after:2026-01-31` and `before:2026-01-31` take local calendar days, both inclusive.
 *
 * Anything else stays plain text, so old queries keep working: an address such as
 * `https://example.com/a:b`, `C++`, or `10:30`. An unknown operator (`foo:bar`), an invalid date,
 * an unclosed quote, or a query past the limits in `config/bookmarks/search.toml` is reported in
 * `diagnostics` and never throws. Regular expressions stay a separate search option.
 */
import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';

const searchConfig = readConfig(
  'bookmarks/search',
  z.strictObject({
    max_query_length: boundedNumber({ integer: true }),
    max_terms: boundedNumber({ integer: true }),
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

/** The version written with a saved query, raised when a query would read differently. */
export const SEARCH_SYNTAX_VERSION = 1;

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

export type SearchQuery = { syntaxVersion: typeof SEARCH_SYNTAX_VERSION; terms: SearchTerm[] };

export type SearchQueryDiagnostic =
  | { code: 'unknown-operator'; operator: string }
  | { code: 'unknown-value'; operator: string; value: string }
  | { code: 'invalid-date'; value: string }
  | { code: 'unclosed-quote' }
  | { code: 'too-long'; limit: number }
  | { code: 'too-many-terms'; limit: number };

export type ParsedSearchQuery = { query: SearchQuery; diagnostics: SearchQueryDiagnostic[] };

const QUOTE = '"';
const NEGATION = '-';
const OPERATOR_SEPARATOR = ':';
/** An operator name: letters only, so `C++:`, `10:30`, and IPv6 addresses stay plain text. */
const OPERATOR_NAME = /^[a-z]+$/i;
/** `YYYY-MM-DD`. */
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const WHITESPACE = /\s/u;

/** One whitespace-separated piece of the query, with whether any of it was quoted. */
type RawToken = { text: string; quoted: boolean; quoteStart: number };

/** Splits on whitespace outside quotes; a quote opens and closes anywhere in a token. */
function tokenize(input: string, diagnostics: SearchQueryDiagnostic[]): RawToken[] {
  const tokens: RawToken[] = [];
  let text = '';
  let quoted = false;
  let inQuote = false;
  let quoteStart = -1;
  const push = () => {
    if (text || quoted) tokens.push({ text, quoted, quoteStart });
    text = '';
    quoted = false;
    quoteStart = -1;
  };
  for (const character of input) {
    if (character === QUOTE) {
      if (!inQuote && quoteStart === -1) quoteStart = text.length;
      inQuote = !inQuote;
      quoted = true;
    } else if (!inQuote && WHITESPACE.test(character)) {
      push();
    } else {
      text += character;
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

/** Reads a query typed in a search box. Never throws; problems are in `diagnostics`. */
export function parseSearchQuery(input: string): ParsedSearchQuery {
  const diagnostics: SearchQueryDiagnostic[] = [];
  let text = input;
  if (text.length > searchConfig.max_query_length) {
    diagnostics.push({ code: 'too-long', limit: searchConfig.max_query_length });
    text = text.slice(0, searchConfig.max_query_length);
  }
  const terms: SearchTerm[] = [];
  for (const token of tokenize(text, diagnostics)) {
    const term = readToken(token, diagnostics);
    if (!term) continue;
    if (terms.length === searchConfig.max_terms) {
      diagnostics.push({ code: 'too-many-terms', limit: searchConfig.max_terms });
      break;
    }
    terms.push(term);
  }
  return { query: { syntaxVersion: SEARCH_SYNTAX_VERSION, terms }, diagnostics };
}

/** Writes a value back, quoted when it has a space, a quote mark, or was a phrase. */
function quote(value: string, phrase: boolean): string {
  const needsQuotes = phrase || [...value].some((character) => WHITESPACE.test(character));
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
  return `${sign}${field}${quote(term.value, term.phrase)}`;
}

export function serializeSearchQuery(query: SearchQuery): string {
  return query.terms.map(serializeTerm).join(' ');
}

/** Whether the query uses an operator, so it is a search and never a folder name to save into. */
export function hasSearchOperators(query: SearchQuery): boolean {
  return query.terms.some((term) => term.kind !== 'text' || term.field !== undefined);
}
