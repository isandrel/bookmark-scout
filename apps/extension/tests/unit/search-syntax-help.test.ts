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
      expect(entry.example.includes(entry.insert)).toBe(true);
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

  it('says what is wrong with OR and parentheses (R07)', () => {
    const describe = (query: string) =>
      parseSearchQuery(query).diagnostics.map(describeSearchDiagnostic);
    expect(describe('(a OR')).toEqual([
      'OR needs a term on each side, so it is left out.',
      'A parenthesis is not closed, so the group runs to the end.',
    ]);
    expect(describe('a) ()')).toEqual([
      'A closing parenthesis has no opening one, so it is left out.',
      'A pair of parentheses is empty, so it is left out.',
    ]);
    expect(describe('((((((((((((((((((((((((((((((((((a')).toEqual([
      expect.stringMatching(/^Parentheses nest at most \d+ deep, so the rest is not searched\.$/),
    ]);
    expect(describe(Array.from({ length: 70 }, () => 'w').join(' OR '))).toEqual([
      expect.stringMatching(/^One OR joins at most \d+ terms, so the rest is not searched\.$/),
    ]);
  });
});
