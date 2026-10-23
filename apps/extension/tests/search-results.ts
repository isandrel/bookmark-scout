/**
 * Every document a query matches, best first, for tests and the search benchmark. The extension
 * itself matches documents one at a time (`compileSearchQuery`): its search boxes keep the
 * library's order, and the AI tools' search ranks by `score` with its own words
 * (`read-actions.ts`).
 */
import { compileSearchQuery, type SearchDocument, type SearchResult } from '@/lib/search-documents';
import type { SearchQuery } from '@/lib/search-query';

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
