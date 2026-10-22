/**
 * A smart rule as Settings edits it (`BookmarkRulesPanel`): plain text fields that become a
 * validated rule (`bookmark-rules.ts`) on save, with the reason when they cannot.
 */
import type { BookmarkTreeNode } from '@/types';

export type RuleDraft = {
  /** Undefined for a rule that is not saved yet. */
  id?: string;
  name: string;
  query: string;
  /** Tags as typed, separated by commas. */
  tags: string;
  /** The folder to move to, or '' for none. */
  folderId: string;
  enabled: boolean;
};

export const EMPTY_RULE_DRAFT: RuleDraft = {
  name: '',
  query: '',
  tags: '',
  folderId: '',
  enabled: true,
};

/** Why a draft is not a rule, in the order the editor reports them. */
export type RuleDraftError = 'name' | 'query' | 'action' | 'invalid';

export function ruleDraftOf(rule: BookmarkRule): RuleDraft {
  return {
    id: rule.id,
    name: rule.name,
    query: rule.query,
    tags: rule.addTags.join(', '),
    folderId: rule.moveTo?.folderId ?? '',
    enabled: rule.enabled,
  };
}

/** Whether a rule's search reads without problems and asks for something. */
export function isRuleQueryReadable(text: string): boolean {
  const { query, diagnostics } = parseSearchQuery(text);
  return query.terms.length > 0 && diagnostics.length === 0;
}

/** The folder path a rule names, as the tree shows it now. */
export function ruleFolderPath(
  tree: readonly BookmarkTreeNode[],
  folderId: string,
): string | undefined {
  const folder = indexWritableFolders(tree).get(folderId);
  return folder?.path.map((title) => getBookmarkDisplayTitle(title)).join(FOLDER_PATH_SEPARATOR);
}

/** How many bookmarks a search finds now, as a run would, whatever the rule's actions. */
export function countRuleMatches(
  query: string,
  tree: readonly BookmarkTreeNode[],
  metadata: StoredBookmarkMetadataById,
): number {
  const probe: BookmarkRule = {
    id: 'probe',
    name: 'probe',
    enabled: true,
    query: query.trim(),
    syntaxVersion: SEARCH_SYNTAX_VERSION,
    addTags: [],
    moveTo: { folderId: '', path: '' },
  };
  return planBookmarkRules([probe], tree, metadata).length;
}

/**
 * The rule a draft saves as, with `id` for a new one and the folder's path read from `tree`; or
 * why it cannot be saved.
 */
export function ruleFromDraft(
  draft: RuleDraft,
  id: string,
  tree: readonly BookmarkTreeNode[] | undefined,
): { rule: BookmarkRule } | { error: RuleDraftError } {
  const tags = parseBookmarkTags(draft.tags);
  const path = draft.folderId && tree ? ruleFolderPath(tree, draft.folderId) : undefined;
  const parsed = bookmarkRuleSchema.safeParse({
    id,
    name: draft.name,
    enabled: draft.enabled,
    query: draft.query,
    syntaxVersion: SEARCH_SYNTAX_VERSION,
    addTags: tags,
    ...(draft.folderId ? { moveTo: { folderId: draft.folderId, path: path ?? '' } } : {}),
  });
  if (parsed.success) return { rule: parsed.data };
  if (!draft.name.trim()) return { error: 'name' };
  if (!isRuleQueryReadable(draft.query)) return { error: 'query' };
  if (tags.length === 0 && !draft.folderId) return { error: 'action' };
  return { error: 'invalid' };
}

/** A rule in one line: its search, then what it does. */
export function describeRule(rule: BookmarkRule): string {
  const actions = [
    ...(rule.addTags.length > 0 ? [t('rules_summaryTags', formatList(rule.addTags))] : []),
    ...(rule.moveTo ? [t('rules_summaryMove', rule.moveTo.path)] : []),
  ];
  return t('rules_summary', [rule.query, formatSeparated(actions)]);
}
