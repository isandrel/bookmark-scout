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
  /** Move new bookmarks to that folder without a review; saved only with a folder. */
  autoMove: boolean;
  enabled: boolean;
};

export const EMPTY_RULE_DRAFT: RuleDraft = {
  name: '',
  query: '',
  tags: '',
  folderId: '',
  autoMove: false,
  enabled: true,
};

/**
 * Why a draft is not a rule, in the order the editor reports them: `pageText` for a search that
 * looks in page text, which rules cannot (`isRunnableRuleQuery`).
 */
export type RuleDraftError = 'name' | 'query' | 'pageText' | 'action' | 'invalid';

export function ruleDraftOf(rule: BookmarkRule): RuleDraft {
  return {
    id: rule.id,
    name: rule.name,
    query: rule.query,
    tags: rule.addTags.join(', '),
    folderId: rule.moveTo?.folderId ?? '',
    autoMove: rule.autoMove === true,
    enabled: rule.enabled,
  };
}

/**
 * Whether a draft does something: tags to add or a folder to move to. Until it does it cannot be
 * saved or turned on, so a template that moves (`move = true`, no folder) waits for one.
 */
export function hasRuleAction(draft: Pick<RuleDraft, 'tags' | 'folderId'>): boolean {
  return parseBookmarkTags(draft.tags).length > 0 || draft.folderId !== '';
}

/**
 * The editor's draft for a template: its search and tags, turned off. A template that moves
 * names no folder (ids differ on every profile), so the user picks one before it can save.
 */
export function ruleDraftOfTemplate(
  template: (typeof BOOKMARK_RULE_TEMPLATES)[number],
  name: string,
): RuleDraft {
  return {
    ...EMPTY_RULE_DRAFT,
    name,
    query: template.query,
    tags: template.add_tags.join(', '),
    enabled: false,
  };
}

/** Whether a rule's search looks in page text (`content:`, `has:content`), which rules cannot. */
export function ruleQueryUsesPageText(text: string): boolean {
  return searchesPageText(parseSearchQuery(text).query);
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

/** A scheme such as `https://`, which makes a sample an address. */
const SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;
/** A host with a dot and maybe a path, such as `github.com/acme`, read as an `https://` address. */
const BARE_ADDRESS = /^[^\s/:]+\.[^\s/:]+(\/\S*)?$/;

/**
 * Whether a sample address or title matches a rule's search (the editor's test field), worked out
 * here and nowhere else: nothing is saved or sent. An address (with a scheme, or a host such as
 * `github.com/acme`) is read as a bookmark with that address and no title, anything else as a
 * bookmark with that title, in no folder and without tags. Undefined while the search cannot run
 * or the sample is empty.
 */
export function ruleMatchesSample(query: string, sample: string): boolean | undefined {
  const text = sample.trim();
  if (!text || !isRunnableRuleQuery(query)) return undefined;
  const address = SCHEME.test(text) ? text : BARE_ADDRESS.test(text) ? `https://${text}` : '';
  const isAddress = address !== '' && URL.canParse(address);
  // Inside one folder below a root, as a bookmark is: the root's own folders are not documents.
  const tree: BookmarkTreeNode[] = [
    {
      id: 'root',
      title: '',
      children: [
        {
          id: 'folder',
          parentId: 'root',
          title: '',
          children: [
            {
              id: 'sample',
              parentId: 'folder',
              title: isAddress ? '' : text,
              ...(isAddress ? { url: address } : {}),
            },
          ],
        },
      ],
    },
  ];
  const [document] = buildSearchDocuments(tree, {});
  const match = compileSearchQuery(parseSearchQuery(query.trim()).query);
  return document !== undefined && match(document) !== undefined;
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
    // Saving approves the folder chosen now, at the path read now, for automatic moves.
    ...(draft.folderId && draft.autoMove ? { autoMove: true } : {}),
  });
  if (parsed.success) return { rule: parsed.data };
  if (!draft.name.trim()) return { error: 'name' };
  if (!isRunnableRuleQuery(draft.query)) {
    return { error: ruleQueryUsesPageText(draft.query) ? 'pageText' : 'query' };
  }
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
