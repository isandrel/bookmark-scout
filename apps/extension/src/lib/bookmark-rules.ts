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
 *
 * Runs settle instead of moving bookmarks back and forth (R33): a bookmark already in a folder a
 * matching rule names stays there, and a move is made only when, in its new folder and with its
 * new tags, no rule would move the bookmark again (else it is blocked as `unstable`). So a second
 * run right after the first moves nothing.
 *
 * Rules plan bookmarks by id (R37): two bookmarks of one address in different folders are planned
 * apart, each by what its own folder and tags make it match.
 *
 * A rule can also move new bookmarks without a review (`autoMove`, `rule-automation.ts`), but only
 * to the exact folder it was saved with: `ruleAutoMoveBlocks` stops it when that folder is gone,
 * managed, or no longer at the path the rule names, and never looks for another by its path.
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
      z
        .strictObject({
          id: z.string().min(1),
          query: z.string().min(1),
          add_tags: z.array(z.string().min(1)),
          /** Moves to a folder the user picks: the template has none, so the editor asks. */
          move: z.boolean(),
        })
        .refine((template) => template.add_tags.length > 0 || template.move, {
          message: 'A template needs tags to add or a move',
        }),
    ),
    editor: z.strictObject({
      query_placeholder: z.string().min(1),
      sample_placeholder: z.url(),
    }),
    automatic: z.strictObject({
      batch_window_ms: z.number().int().positive(),
      max_batch: z.number().int().positive(),
      log_max: z.number().int().positive(),
    }),
    runs: z.strictObject({
      log_max_bookmarks: z.number().int().positive(),
      conflicts_max: z.number().int().positive(),
    }),
  }),
);

export const MAX_BOOKMARK_RULES = rulesConfig.max_rules;
export const BOOKMARK_RULE_LIMITS = rulesConfig;

/** Starter rules Settings offers (`[[templates]]`), each added turned off. */
export const BOOKMARK_RULE_TEMPLATES = rulesConfig.templates;

/** The examples the rule editor shows in its empty Search and Test fields. */
export const BOOKMARK_RULE_EDITOR_EXAMPLES = rulesConfig.editor;
export type BookmarkRuleTemplateId = (typeof BOOKMARK_RULE_TEMPLATES)[number]['id'];

/**
 * A query a rule can run: read without a problem, with at least one term, and not looking in page
 * text. A query past the limits in `config/bookmarks/search.toml` (terms, nesting, terms one OR
 * joins) has a problem, so a rule never runs on part of its search. Rules match bookmarks without
 * their indexed page text (`planBookmarkRules`), so `content:` would find nothing and
 * `-has:content` everything: such a search is refused rather than run wrong.
 */
export function isRunnableRuleQuery(text: string): boolean {
  const { query, diagnostics } = parseSearchQuery(text);
  return diagnostics.length === 0 && query.terms.length > 0 && !searchesPageText(query);
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
    /**
     * Move new bookmarks to `moveTo` without a review, while Move New Bookmarks is on. The user
     * turns it on for this rule and this folder; rules saved before it existed leave it out (off).
     */
    autoMove: z.boolean().optional(),
  })
  .transform(({ autoMove, ...rule }) => ({
    ...rule,
    query: upgradeSearchText(rule.query, rule.syntaxVersion),
    syntaxVersion: SEARCH_SYNTAX_VERSION,
    // Only a rule with a folder can move; kept only when on, so a rule reads as it was saved.
    ...(autoMove && rule.moveTo ? { autoMove: true } : {}),
  }))
  .refine((rule) => isRunnableRuleQuery(rule.query), {
    message: 'A rule needs a search it can run',
  })
  .refine((rule) => rule.addTags.length > 0 || rule.moveTo !== undefined, {
    message: 'A rule needs an action',
  });

export type BookmarkRule = z.infer<typeof bookmarkRuleSchema>;

/** The History's and Background tasks' name for a reviewed run: the tool's title. */
export const RULE_RUN_TOOL = 'tools_bookmarkRules' satisfies MessageKey;

/**
 * A rule's version: a fingerprint of what it does (its search, tags, and folder). A review keeps
 * the version of each rule that matched a bookmark, and applying it skips that bookmark when one
 * of them was edited, turned off, or deleted since (R14), so nothing is changed by a rule the
 * user did not review. Its name and automatic moves are not part of it: they change no run.
 */
export function ruleVersion(rule: BookmarkRule): string {
  return hashText(JSON.stringify([rule.query, rule.addTags, rule.moveTo?.folderId ?? null]));
}

/**
 * Whether every rule of `versions` is still on, with the version a review saw. `rules` are the
 * rules as they are now.
 */
export function rulesUnchanged(
  rules: readonly BookmarkRule[],
  versions: Readonly<Record<string, string>>,
): boolean {
  return Object.entries(versions).every(([id, version]) => {
    const rule = rules.find((entry) => entry.id === id);
    return rule?.enabled === true && ruleVersion(rule) === version;
  });
}

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

/**
 * Why a rule's move cannot happen: its folder is gone or managed, or `unstable`, when in that
 * folder another rule would move the bookmark again, so runs would move it back and forth.
 */
export type RuleMoveBlock = 'missingFolder' | 'managed' | 'unstable';

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
  /** Each of those rules' version (`ruleVersion`) when planned, by id. */
  ruleVersions: Record<string, string>;
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
    version: ruleVersion(rule),
    match: compileSearchQuery(parseSearchQuery(rule.query).query),
  }));
  const documents = buildSearchDocuments(tree, metadata);
  // The folder names a bookmark has inside each folder, as its document would say them.
  const namesInside = new Map<string, readonly string[]>();
  for (const document of documents) {
    if (document.kind === 'folder')
      namesInside.set(document.id, [...document.folders, document.title]);
  }
  /** What the rules want for `document`: what each adds, and the folders they would move it to. */
  const evaluate = (document: SearchDocument) => {
    const matching = compiled.filter(({ match }) => match(document));
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
    return { matching, addTags, moves };
  };
  /**
   * Whether, once moved to `folderId` with its new tags, the bookmark stays: no rule would move it
   * on. A move that fails this is never made, so running the rules again never moves a bookmark
   * back and forth between folders, or around a ring of them.
   */
  const staysIn = (document: SearchDocument, folderId: string, addTags: readonly string[]) => {
    const folders = namesInside.get(folderId) ?? [];
    const moved: SearchDocument = {
      ...document,
      folders,
      folderPath: folders.join(FOLDER_PATH_SEPARATOR),
      tags: [...document.tags, ...addTags],
    };
    const { moves } = evaluate(moved);
    return moves.length === 0 || moves.some((move) => move.folderId === folderId);
  };
  const items: RulePlanItem[] = [];
  for (const document of documents) {
    if (document.kind !== 'bookmark' || !document.url) continue;
    if (only && !only.has(document.id)) continue;
    const { matching, addTags, moves } = evaluate(document);
    if (matching.length === 0) continue;
    const node = index.nodes.get(document.id);
    const parentId = node?.parentId ?? '';
    // Already in a folder a matching rule names: it stays, and other folders are conflicts.
    const stays = moves.some((move) => move.folderId === parentId);
    const [first] = moves;
    const conflicts = moves.filter((move) =>
      stays ? move.folderId !== parentId : move !== first && move.folderId !== first?.folderId,
    );
    const blocked =
      first && !stays
        ? isManaged(index, node)
          ? 'managed'
          : (moveTarget(index, first.folderId) ??
            (staysIn(document, first.folderId, addTags) ? undefined : 'unstable'))
        : undefined;
    items.push({
      id: document.id,
      title: document.title,
      url: document.url,
      parentId,
      folderPath: document.folderPath,
      ruleIds: matching.map(({ rule }) => rule.id),
      ruleVersions: Object.fromEntries(matching.map(({ rule, version }) => [rule.id, version])),
      addTags,
      ...(first && !stays && !blocked ? { move: first } : {}),
      conflicts,
      ...(blocked ? { blocked } : {}),
    });
  }
  return items;
}

/**
 * Why a rule's automatic moves are stopped: its folder is gone or managed (as for a reviewed
 * move), or `folderChanged`, when the folder with that id is no longer at the path the rule was
 * saved with (renamed or moved, or another profile's folder with the same id after a restore).
 */
export type RuleAutoMoveBlock = RuleMoveBlock | 'folderChanged';

/**
 * For each rule that moves new bookmarks automatically, by id: why it cannot now, or undefined
 * when its folder is the one it was saved with. Unlike a reviewed run, the folder is never looked
 * for by its path: a move nobody reviews goes only to the folder the user approved.
 */
export function ruleAutoMoveBlocks(
  rules: readonly BookmarkRule[],
  tree: readonly BookmarkTreeNode[],
): Map<string, RuleAutoMoveBlock | undefined> {
  const blocks = new Map<string, RuleAutoMoveBlock | undefined>();
  let index: TreeIndex | undefined;
  let paths: Map<string, string[]> | undefined;
  for (const rule of rules) {
    if (!rule.autoMove || !rule.moveTo) continue;
    index ??= indexTree(tree);
    paths ??= indexFolderPaths(tree);
    const { folderId, path } = rule.moveTo;
    const block =
      moveTarget(index, folderId) ??
      (paths.get(path)?.includes(folderId) ? undefined : 'folderChanged');
    blocks.set(rule.id, block);
  }
  return blocks;
}
