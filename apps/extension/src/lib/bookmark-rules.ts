/**
 * Smart rules: IF a bookmark matches a search, written in the search query language
 * (`search-query.ts`) and matched like every search box (`search-documents.ts`), THEN add tags
 * and move it to a folder. Rules run in list order; `planBookmarkRules` works out what they would
 * do without changing anything, so every run is reviewed before it is applied.
 *
 * Each rule reads the bookmark as it was before any rule ran, so the order decides only which move
 * wins: the first rule that moves a bookmark does, and any other folder a later rule names is a
 * conflict to review. Tags from every matching rule are added once each, compared by `tagKey`,
 * and a tag the bookmark already has is not added again. Folders are never moved or tagged.
 */
import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';

const rulesConfig = readConfig(
  'rules/rules',
  z.strictObject({
    max_rules: z.number().int().positive(),
    name_max_length: z.number().int().positive(),
    id_max_length: z.number().int().positive(),
    max_tags: z.number().int().positive(),
    tag_max_length: z.number().int().positive(),
    templates: z.array(
      z.strictObject({
        id: z.string().min(1),
        query: z.string().min(1),
        add_tags: z.array(z.string().min(1)).min(1),
      }),
    ),
    auto_tag: z.strictObject({
      batch_window_ms: z.number().int().positive(),
      max_batch: z.number().int().positive(),
      log_max: z.number().int().positive(),
    }),
  }),
);

export const MAX_BOOKMARK_RULES = rulesConfig.max_rules;
export const BOOKMARK_RULE_LIMITS = rulesConfig;

/** Starter rules Settings offers (`[[templates]]`), each added turned off. */
export const BOOKMARK_RULE_TEMPLATES = rulesConfig.templates;
export type BookmarkRuleTemplateId = (typeof BOOKMARK_RULE_TEMPLATES)[number]['id'];

/**
 * A query a rule can run: read without a problem and with at least one term. A query past the
 * limits in `config/bookmarks/search.toml` (terms, nesting, terms one OR joins) has a problem, so
 * a rule never runs on part of its search.
 */
function isRunnableQuery(text: string): boolean {
  const { query, diagnostics } = parseSearchQuery(text);
  return diagnostics.length === 0 && query.terms.length > 0;
}

const tagSchema = z.string().trim().min(1).max(rulesConfig.tag_max_length);

export const bookmarkRuleSchema = z
  .strictObject({
    id: z.string().min(1).max(rulesConfig.id_max_length),
    name: z.string().trim().min(1).max(rulesConfig.name_max_length),
    enabled: z.boolean(),
    /**
     * IF: a search in the search query language of `syntaxVersion`. One saved in an older version
     * is rewritten in the current one as it is read, finding the same bookmarks.
     */
    query: z.string().trim().min(1),
    syntaxVersion: searchSyntaxVersionSchema,
    /** THEN: tags to add. */
    addTags: z.array(tagSchema).max(rulesConfig.max_tags),
    /**
     * THEN: the folder to move to. Its path is kept to name it, and to find it again when the id
     * is gone (another profile, or the folder was deleted and restored).
     */
    moveTo: z.strictObject({ folderId: z.string().min(1), path: z.string() }).optional(),
  })
  .transform((rule) => ({
    ...rule,
    query: upgradeSearchText(rule.query, rule.syntaxVersion),
    syntaxVersion: SEARCH_SYNTAX_VERSION,
  }))
  .refine((rule) => isRunnableQuery(rule.query), { message: 'A rule needs a search it can run' })
  .refine((rule) => rule.addTags.length > 0 || rule.moveTo !== undefined, {
    message: 'A rule needs an action',
  });

export type BookmarkRule = z.infer<typeof bookmarkRuleSchema>;

/**
 * The rules in a stored list that can run, in order: malformed ones, repeated ids, and those past
 * `max_rules` are left out.
 */
export function parseBookmarkRules(value: unknown): BookmarkRule[] {
  if (!Array.isArray(value)) return [];
  const rules: BookmarkRule[] = [];
  const ids = new Set<string>();
  for (const entry of value) {
    const parsed = bookmarkRuleSchema.safeParse(entry);
    if (!parsed.success || ids.has(parsed.data.id)) continue;
    ids.add(parsed.data.id);
    rules.push(parsed.data);
    if (rules.length === MAX_BOOKMARK_RULES) break;
  }
  return rules;
}

/** Why a rule's move cannot happen. */
export type RuleMoveBlock = 'missingFolder' | 'managed';

export type RuleMove = { ruleId: string; folderId: string; path: string };

/** What the rules would do to one bookmark they match. */
export type RulePlanItem = {
  id: string;
  title: string;
  url: string;
  /** Where it is now: the folder id and path as shown. */
  parentId: string;
  folderPath: string;
  /** The rules that match it, in order. */
  ruleIds: string[];
  /** Tags to add: only those it does not have, in the first rule's spelling. */
  addTags: string[];
  /** The move the first moving rule makes, unless it is already there or cannot move. */
  move?: RuleMove;
  /** Other folders later rules would move it to. */
  conflicts: RuleMove[];
  blocked?: RuleMoveBlock;
};

/** Whether a planned item changes anything when applied. */
export function changesBookmark(item: RulePlanItem): boolean {
  return item.addTags.length > 0 || item.move !== undefined;
}

type TreeIndex = { nodes: Map<string, BookmarkTreeNode> };

function indexTree(tree: readonly BookmarkTreeNode[]): TreeIndex {
  const nodes = new Map<string, BookmarkTreeNode>();
  const visit = (node: BookmarkTreeNode) => {
    nodes.set(node.id, node);
    for (const child of node.children ?? []) visit(child);
  };
  for (const root of tree) visit(root);
  return { nodes };
}

/** Whether `node` or a folder above it is managed by the browser's policy. */
function isManaged(index: TreeIndex, node: BookmarkTreeNode | undefined): boolean {
  for (let current = node; current; current = index.nodes.get(current.parentId ?? '')) {
    if (current.unmodifiable) return true;
  }
  return false;
}

/** The folder a rule moves to, if it can take bookmarks: it exists and is not managed. */
function moveTarget(index: TreeIndex, folderId: string): RuleMoveBlock | undefined {
  const folder = index.nodes.get(folderId);
  if (!folder || folder.url !== undefined || isBookmarkTreeRoot(folder)) return 'missingFolder';
  return isManaged(index, folder) ? 'managed' : undefined;
}

/** Each folder's path as the rule editor writes it, to its ids (more than one when names repeat). */
function indexFolderPaths(tree: readonly BookmarkTreeNode[]): Map<string, string[]> {
  const paths = new Map<string, string[]>();
  const visit = (nodes: readonly BookmarkTreeNode[], parents: string[]) => {
    for (const node of nodes) {
      if (node.url !== undefined || !node.children) continue;
      const isRoot = isBookmarkTreeRoot(node);
      const path = isRoot ? parents : [...parents, getBookmarkDisplayTitle(node.title)];
      if (!isRoot) {
        const key = path.join(FOLDER_PATH_SEPARATOR);
        paths.set(key, [...(paths.get(key) ?? []), node.id]);
      }
      visit(node.children, path);
    }
  };
  visit(tree, []);
  return paths;
}

/**
 * A rule's move with its folder found in this tree: by id, or, when that id is not a folder here
 * (a rule restored from a backup of another browser profile, or a folder deleted and made again),
 * by the path the rule names, when exactly one folder has it. The review shows the path, so a
 * move to a folder found this way is still approved before it happens.
 */
function resolveMove(
  index: TreeIndex,
  paths: () => Map<string, string[]>,
  move: RuleMove,
): RuleMove {
  const folder = index.nodes.get(move.folderId);
  if (folder && folder.url === undefined) return move;
  const found = paths().get(move.path) ?? [];
  return found.length === 1 ? { ...move, folderId: found[0] as string } : move;
}

/**
 * What `rules` (enabled ones, in order) would do to the bookmarks of `tree`, read only. Bookmarks
 * no rule matches are left out; ones they match but would not change are kept, so a run can say
 * they already follow the rules. With `only`, just those bookmarks are planned (the rest of the tree
 * still gives their folder paths).
 */
export function planBookmarkRules(
  rules: readonly BookmarkRule[],
  tree: readonly BookmarkTreeNode[],
  metadata: StoredBookmarkMetadataById,
  only?: ReadonlySet<string>,
): RulePlanItem[] {
  const enabled = rules.filter((rule) => rule.enabled);
  if (enabled.length === 0) return [];
  const index = indexTree(tree);
  let folderPaths: Map<string, string[]> | undefined;
  const paths = () => {
    folderPaths ??= indexFolderPaths(tree);
    return folderPaths;
  };
  const compiled = enabled.map((rule) => ({
    rule,
    match: compileSearchQuery(parseSearchQuery(rule.query).query),
  }));
  const items: RulePlanItem[] = [];
  for (const document of buildSearchDocuments(tree, metadata)) {
    if (document.kind !== 'bookmark' || !document.url) continue;
    if (only && !only.has(document.id)) continue;
    const matching = compiled.filter(({ match }) => match(document));
    if (matching.length === 0) continue;
    const node = index.nodes.get(document.id);
    const parentId = node?.parentId ?? '';
    const has = new Set(document.tags.map(tagKey));
    const addTags: string[] = [];
    const moves: RuleMove[] = [];
    for (const { rule } of matching) {
      for (const tag of rule.addTags) {
        const key = tagKey(tag);
        if (has.has(key)) continue;
        has.add(key);
        addTags.push(tag.trim());
      }
      if (rule.moveTo) moves.push(resolveMove(index, paths, { ruleId: rule.id, ...rule.moveTo }));
    }
    const [first, ...later] = moves;
    const conflicts = later.filter((move) => move.folderId !== first?.folderId);
    const blocked = first
      ? isManaged(index, node)
        ? 'managed'
        : moveTarget(index, first.folderId)
      : undefined;
    items.push({
      id: document.id,
      title: document.title,
      url: document.url,
      parentId,
      folderPath: document.folderPath,
      ruleIds: matching.map(({ rule }) => rule.id),
      addTags,
      ...(first && !blocked && first.folderId !== parentId ? { move: first } : {}),
      conflicts,
      ...(blocked ? { blocked } : {}),
    });
  }
  return items;
}
