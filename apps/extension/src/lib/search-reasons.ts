/**
 * Where a search result matched, in words, for a result whose title did not match: the popup and
 * side panel rows and the manager's table and cards say it the same way ("in URL", "tag: work").
 */

/** The places a search can match besides the title, in the order a row names them. */
const SEARCH_REASONS = [
  ['tag', 'search_reasonTag'],
  ['url', 'search_reasonUrl'],
  ['domain', 'search_reasonUrl'],
  ['summary', 'search_reasonSummary'],
  ['content', 'search_reasonContent'],
  ['folder', 'search_reasonFolder'],
] as const satisfies readonly (readonly [SearchMatchField, MessageKey])[];

/** Where a search result matched, for a row whose title did not. */
export function searchReasonLabel(reasons: readonly SearchMatchReason[] = []): string | undefined {
  if (reasons.some((reason) => reason.field === 'title')) return undefined;
  for (const [field, message] of SEARCH_REASONS) {
    const reason = reasons.find((candidate) => candidate.field === field);
    if (!reason) continue;
    if (reason.field === 'tag') return t(message, [reason.value]);
    if (reason.field === 'content') return t(message, [reason.snippet]);
    return t(message);
  }
  return undefined;
}
