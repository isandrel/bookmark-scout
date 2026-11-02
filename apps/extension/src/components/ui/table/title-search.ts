/**
 * The search box's filter on the manager table's Title column, without the column definitions, so
 * saved searches read it in code that loads no React.
 */

/**
 * What was typed, and what the search query language (`use-search-matches.ts`) found for it,
 * matched by row id.
 */
export type TitleSearchFilter = { text: string; matches: SearchMatches };

/** The text of the Title column's filter, which saved searches also set as plain text. */
export function titleSearchText(value: unknown): string {
  if (typeof value === 'string') return value;
  return (value as Partial<TitleSearchFilter> | undefined)?.text ?? '';
}
