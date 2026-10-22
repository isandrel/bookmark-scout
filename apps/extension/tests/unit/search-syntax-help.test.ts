import { beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from '@/hooks/use-i18n';
import { parseSearchQuery } from '@/lib/search-query';
import {
  addSearchSyntax,
  describeSearchDiagnostic,
  SEARCH_GUIDE_URL,
  SEARCH_SYNTAX_HELP,
} from '@/lib/search-syntax-help';

beforeEach(() => {
  setLanguage('en');
});

describe('search syntax help', () => {
  it('adds an operator as a new term', () => {
    expect(addSearchSyntax('', 'tag:')).toBe('tag:');
    expect(addSearchSyntax('react', 'tag:')).toBe('react tag:');
    expect(addSearchSyntax('react ', '-')).toBe('react -');
  });

  it('lists only examples the search query language reads without a problem', () => {
    expect(new Set(SEARCH_SYNTAX_HELP.map((entry) => entry.insert)).size).toBe(
      SEARCH_SYNTAX_HELP.length,
    );
    for (const entry of SEARCH_SYNTAX_HELP) {
      expect(entry.example.startsWith(entry.insert)).toBe(true);
      expect(parseSearchQuery(entry.example).diagnostics).toEqual([]);
    }
    expect(SEARCH_GUIDE_URL).toMatch(/\/guides\/search#search-words-and-operators$/);
  });

  it('says what each problem in a query means', () => {
    const { diagnostics } = parseSearchQuery('foo:bar is:nothing after:2026-02-30 "open');
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'unclosed-quote',
      'unknown-operator',
      'unknown-value',
      'invalid-date',
    ]);
    expect(diagnostics.map(describeSearchDiagnostic)).toEqual([
      'A quote is not closed, so the phrase runs to the end.',
      'foo: is not an operator, so it is searched as text.',
      'is:nothing is not a known value, so it is left out.',
      '2026-02-30 is not a date in the form YYYY-MM-DD, so it is left out.',
    ]);
  });
});
