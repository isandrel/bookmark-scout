/**
 * What the search boxes' syntax help lists: the search query language (`search-query.ts`), one
 * entry per operator, in the order shown. Choosing an entry adds its `insert` to the query, and
 * `example` shows it in use.
 */
import { z } from 'zod';

const helpConfig = readConfig(
  'ui/search-help',
  z.strictObject({ guide_path: z.string().regex(/^\/[\w\-/#]*$/) }),
);

/** The docs section that explains the search query language. */
export const SEARCH_GUIDE_URL = `${import.meta.env.BOOKMARK_SCOUT_DOCS_URL}${helpConfig.guide_path}`;

export type SearchSyntaxEntry = {
  /** What choosing the entry adds to the query. */
  insert: string;
  example: string;
  labelKey: MessageKey;
};

export const SEARCH_SYNTAX_HELP: readonly SearchSyntaxEntry[] = [
  { insert: '"', example: '"two words"', labelKey: 'searchHelp_phrase' },
  { insert: '-', example: '-word', labelKey: 'searchHelp_exclude' },
  { insert: 'title:', example: 'title:react', labelKey: 'searchHelp_title' },
  { insert: 'url:', example: 'url:github', labelKey: 'searchHelp_url' },
  { insert: 'domain:', example: 'domain:github.com', labelKey: 'searchHelp_domain' },
  { insert: 'folder:', example: 'folder:Work', labelKey: 'searchHelp_folder' },
  { insert: 'tag:', example: 'tag:reading', labelKey: 'searchHelp_tag' },
  { insert: 'summary:', example: 'summary:recipe', labelKey: 'searchHelp_summary' },
  { insert: 'is:bookmark', example: 'is:bookmark', labelKey: 'searchHelp_isBookmark' },
  { insert: 'is:folder', example: 'is:folder', labelKey: 'searchHelp_isFolder' },
  { insert: 'is:untagged', example: 'is:untagged', labelKey: 'searchHelp_isUntagged' },
  { insert: 'has:tags', example: 'has:tags', labelKey: 'searchHelp_hasTags' },
  { insert: 'has:summary', example: 'has:summary', labelKey: 'searchHelp_hasSummary' },
  { insert: 'after:', example: 'after:2026-01-31', labelKey: 'searchHelp_after' },
  { insert: 'before:', example: 'before:2026-01-31', labelKey: 'searchHelp_before' },
];

/** `query` with `insert` added as a new term, after a space when the query does not end in one. */
export function addSearchSyntax(query: string, insert: string): string {
  if (query === '' || /\s$/u.test(query)) return `${query}${insert}`;
  return `${query} ${insert}`;
}

/** What a problem in a query means, in the user's language. */
export function describeSearchDiagnostic(diagnostic: SearchQueryDiagnostic): string {
  switch (diagnostic.code) {
    case 'unknown-operator':
      return t('searchDiagnostic_unknownOperator', `${diagnostic.operator}:`);
    case 'unknown-value':
      return t('searchDiagnostic_unknownValue', `${diagnostic.operator}:${diagnostic.value}`);
    case 'invalid-date':
      return t('searchDiagnostic_invalidDate', diagnostic.value);
    case 'unclosed-quote':
      return t('searchDiagnostic_unclosedQuote');
    case 'too-long':
      return t('searchDiagnostic_tooLong', String(diagnostic.limit));
    case 'too-many-terms':
      return t('searchDiagnostic_tooManyTerms', String(diagnostic.limit));
  }
}
