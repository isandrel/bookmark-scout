/**
 * Smart Rules on new bookmarks, without a review. Two separate opt-ins, both device settings off
 * by default, because tagging and moving carry different risks:
 *
 * - **Tag New Bookmarks** (`bookmarkRulesAutoTag`): enabled rules add their tags. It never moves
 *   anything, whatever the rules say.
 * - **Move New Bookmarks** (`bookmarkRulesAutoMove`): a rule the user marked "Move new bookmarks
 *   automatically" (`autoMove`) moves the bookmark to its folder. Both the setting and the rule
 *   must say so, and only to the exact folder the rule was saved with (`ruleAutoMoveBlocks`): when
 *   that folder is gone, managed, or no longer at the rule's path, the move is not made, and a
 *   folder with the same path is never used instead. As in a reviewed run, the first rule that
 *   moves a bookmark decides; a bookmark two rules would move to different folders, one in a
 *   managed folder, and one already there stay put.
 *
 * Runs in the background, whose bookmark listener is added synchronously at start, so it works
 * with every page closed.
 *
 * - **Which bookmarks** (`bookmarkRulesNewFrom`, a device setting): the browser does not say who
 *   added a bookmark. Bookmark Scout knows only its own saves, which its undo history names. So
 *   by default (`scout`, maintainer decision R4: changes from elsewhere are only observed until
 *   the user opts in) rules act only on bookmarks saved through Bookmark Scout; with `any`, also
 *   on those from the browser's star, other extensions, and sync, all treated alike, never named.
 *   Moves always leave out bookmarks a page of Bookmark Scout put where the user chose (quick
 *   save, the manager, Undo: the undo history names them), and one moved again before its batch
 *   ran, so Move New Bookmarks acts only with `any`. Bookmarks added together are handled in
 *   one batch, and a batch larger than `max_batch` (a sync or an import) is left alone, as are
 *   bookmarks the browser imports. A bookmark is handled only as the settings were both when it
 *   was added and when its batch runs, whichever allows less.
 * - **Traceable:** each tagging and move is listed in Settings with its Undo (`rule-auto-log.ts`);
 *   each batch's moves are one change in the History and the Audit History, from Bookmark Scout
 *   itself, labeled as Smart Rules moving automatically. No move happens without that record
 *   (`requireRecord`, R25): when it cannot be stored, the batch moves nothing.
 * - **No loops:** tags are stored apart from the bookmarks and cause no bookmark event, a move
 *   causes no new-bookmark event, and a tag the bookmark already has is not added again.
 *
 * No React here.
 */

import type { BookmarkTreeNode } from '@/types';

const { batch_window_ms: BATCH_WINDOW_MS, max_batch: MAX_BATCH } = BOOKMARK_RULE_LIMITS.automatic;

/** The History's name for what moved bookmarks: Smart Rules on their own. */
export const RULE_AUTO_MOVE_TOOL = 'rules_autoMoveTool' satisfies MessageKey;

/** Which automatic changes are on, and for which new bookmarks. */
export type RuleAutomation = { tag: boolean; move: boolean; from: RuleNewBookmarkSource };

/** A new bookmark, and the folder it was added to. */
export type NewBookmark = { id: string; parentId: string };

export type RuleAutomationResult = { tagged: number; moved: number };

/** Adds the tags enabled rules give to the planned bookmarks; returns how many got tags. */
async function tagNewBookmarks(plan: readonly RulePlanItem[]): Promise<number> {
  const tagged = plan.filter((item) => item.addTags.length > 0);
  if (tagged.length === 0) return 0;
  await mergeStoredBookmarkMetadata(
    Object.fromEntries(tagged.map((item) => [item.id, { tags: item.addTags }])),
    { tagMode: 'append', summaryMode: 'replace', dedupeTags: true },
  );
  // Tags are not bookmark changes, so the History never shows them: Settings lists them instead.
  await recordRuleAutoChanges(
    tagged.map((item) => ({
      kind: 'tag' as const,
      bookmarkId: item.id,
      title: item.title,
      tags: item.addTags,
    })),
  );
  return tagged.length;
}

/**
 * Moves the planned bookmarks whose first moving rule moves new bookmarks automatically, to that
 * rule's own folder, as one audited change; returns how many moved.
 */
async function moveNewBookmarks(
  plan: readonly RulePlanItem[],
  rules: readonly BookmarkRule[],
  tree: readonly BookmarkTreeNode[],
  added: ReadonlyMap<string, string>,
): Promise<number> {
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const blocks = ruleAutoMoveBlocks(rules, tree);
  const placedByExtension = await bookmarkIdsInHistory();
  const moves = plan.flatMap((item) => {
    const rule = item.move ? byId.get(item.move.ruleId) : undefined;
    if (!item.move || !rule?.autoMove || !rule.moveTo) return [];
    if (!blocks.has(rule.id) || blocks.get(rule.id)) return [];
    // Never a folder found by its path: only the one the rule was saved with.
    if (item.move.folderId !== rule.moveTo.folderId) return [];
    if (item.conflicts.length > 0 || placedByExtension.has(item.id)) return [];
    // Moved again since it was added (quick save's Move, or the user): it stays where it was put.
    if (added.get(item.id) !== item.parentId) return [];
    return [{ item, to: rule.moveTo }];
  });
  if (moves.length === 0) return 0;
  let result: BookmarkChangesResult;
  try {
    result = await applyBookmarkChanges(
      moves.map(({ item, to }) => ({
        kind: 'move' as const,
        id: item.id,
        title: item.title,
        expect: { parentId: item.parentId },
        to: { parentId: to.folderId },
      })),
      {
        tool: RULE_AUTO_MOVE_TOOL,
        origin: { source: 'background', actor: 'system' },
        requireRecord: true,
      },
    );
  } catch (error) {
    if (!(error instanceof AuditStoreError)) throw error;
    // Fail closed: no move nobody reviewed happens without a record to find and undo it by.
    console.warn('[Rules] New bookmarks not moved: the Audit History is unavailable.');
    return 0;
  }
  const entry = result.recorded?.entry;
  const paths = new Map(moves.map(({ to }) => [to.folderId, to.path]));
  await recordRuleAutoChanges(
    (entry?.operations ?? []).flatMap((op) =>
      op.kind === 'move'
        ? [
            {
              kind: 'move' as const,
              bookmarkId: op.id,
              title: op.title ?? '',
              from: { parentId: op.from.parentId, index: op.from.index },
              to: { folderId: op.to.parentId, path: paths.get(op.to.parentId) ?? '' },
              ...(entry?.operationId ? { operationId: entry.operationId } : {}),
            },
          ]
        : [],
    ),
  );
  return result.applied;
}

/** The new bookmarks `from` lets rules act on: with `scout`, those Bookmark Scout saved. */
async function fromAllowedSources(
  added: readonly NewBookmark[],
  from: RuleNewBookmarkSource,
): Promise<readonly NewBookmark[]> {
  if (from === 'any' || added.length === 0) return added;
  const saved = await bookmarkIdsInHistory({ created: true });
  return added.filter(({ id }) => saved.has(id));
}

/**
 * Applies the enabled rules to the `added` bookmarks `on.from` allows that are still
 * bookmarks: their tags when `on.tag`, their automatic moves when `on.move`. Returns how many
 * were tagged and moved.
 */
export async function applyRulesToNewBookmarks(
  newBookmarks: readonly NewBookmark[],
  on: RuleAutomation,
): Promise<RuleAutomationResult> {
  const none = { tagged: 0, moved: 0 };
  if (!on.tag && !on.move) return none;
  const added = await fromAllowedSources(newBookmarks, on.from);
  if (added.length === 0) return none;
  const rules = (await bookmarkRulesValue.get()).filter((rule) => rule.enabled);
  const acting = rules.filter(
    (rule) => (on.tag && rule.addTags.length > 0) || (on.move && rule.autoMove),
  );
  if (acting.length === 0) return none;
  const tree = await fetchBookmarkTree();
  const ids = added.map(({ id }) => id);
  const metadata = await getStoredBookmarkMetadata(ids);
  // Every enabled rule, so the order decides the move as in a reviewed run.
  const plan = planBookmarkRules(rules, tree, metadata, new Set(ids));
  const tagged = on.tag ? await tagNewBookmarks(plan) : 0;
  const moved = on.move
    ? await moveNewBookmarks(plan, rules, tree, new Map(added.map((b) => [b.id, b.parentId])))
    : 0;
  return { tagged, moved };
}

/** What undoing one automatic change did. */
export type RuleAutoUndoOutcome =
  | { kind: 'tag'; removed: number }
  /** How many bookmarks a reviewed run's tags were taken from. */
  | { kind: 'run'; bookmarks: number }
  | { kind: 'move'; result: 'moved' | 'deleted' | 'changed' | 'parentMissing' };

async function undoAutoMove(entry: RuleAutoMoveEntry): Promise<RuleAutoUndoOutcome> {
  const outcome = (result: 'moved' | 'deleted' | 'changed' | 'parentMissing') => ({
    kind: 'move' as const,
    result,
  });
  const live = await getLiveBookmark(entry.bookmarkId);
  if (!live) return outcome('deleted');
  if (live.parentId !== entry.to.folderId) return outcome('changed');
  const parent = await getBookmark(entry.from.parentId).catch(() => undefined);
  if (!parent || parent.url !== undefined) return outcome('parentMissing');
  const siblings = await getBookmarkChildren(entry.from.parentId);
  await recordBookmarkWrites(
    { action: 'move', title: live.title, tool: RULE_AUTO_MOVE_TOOL },
    (writer) =>
      writer.move(entry.bookmarkId, {
        parentId: entry.from.parentId,
        index: Math.min(entry.from.index, siblings.length),
      }),
    {
      replay: 'undo',
      ...(entry.operationId ? { relatedOperationId: entry.operationId } : {}),
    },
  );
  return outcome('moved');
}

/**
 * Takes back one entry of the rules log and drops it: a tagging's tags; a reviewed run's tags
 * (its moves are undone from the History); or a move, put back where the bookmark was when it is
 * still in the rule's folder and its earlier folder still exists. A bookmark moved or deleted
 * since is left alone. Undefined when the entry is gone.
 */
export async function undoRuleAutoChange(
  entryId: string,
): Promise<RuleAutoUndoOutcome | undefined> {
  const entry = await getRuleAutoEntry(entryId);
  if (!entry) return undefined;
  if (entry.kind === 'tag') return { kind: 'tag', removed: await undoAutoTag(entry) };
  if (entry.kind === 'run') return { kind: 'run', bookmarks: await undoRuleRunTags(entry) };
  try {
    return await undoAutoMove(entry);
  } finally {
    await dropRuleAutoEntry(entry.id);
  }
}

/** A bookmark waiting for its batch, with which automatic changes were on when it was added. */
type Pending = NewBookmark & { on: Promise<RuleAutomation> };

let pending: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let importing = false;

async function automationNow(): Promise<RuleAutomation> {
  const settings = await getSettings();
  return {
    tag: settings.bookmarkRulesEnabled && settings.bookmarkRulesAutoTag,
    move: settings.bookmarkRulesEnabled && settings.bookmarkRulesAutoMove,
    from: settings.bookmarkRulesNewFrom,
  };
}

async function runBatch(): Promise<void> {
  const batch = pending;
  pending = [];
  timer = undefined;
  if (batch.length > MAX_BATCH) return;
  const states = await Promise.all(batch.map(async (item) => ({ item, on: await item.on })));
  const now = await automationNow();
  // Each bookmark as the settings were when it was added and are now, whichever allows less; one
  // plan per combination, so a bookmark is only handled by what was on for it.
  const groups = new Map<string, { on: RuleAutomation; items: NewBookmark[] }>();
  for (const { item, on } of states) {
    const allowed: RuleAutomation = {
      tag: now.tag && on.tag,
      move: now.move && on.move,
      from: now.from === 'any' && on.from === 'any' ? 'any' : 'scout',
    };
    if (!allowed.tag && !allowed.move) continue;
    const key = JSON.stringify(allowed);
    const group = groups.get(key) ?? { on: allowed, items: [] };
    group.items.push({ id: item.id, parentId: item.parentId });
    groups.set(key, group);
  }
  for (const { on, items } of groups.values()) await applyRulesToNewBookmarks(items, on);
}

/** Starts Tag New Bookmarks and Move New Bookmarks. Call synchronously at background start. */
export function registerRuleAutomation(): void {
  const api = browser.bookmarks;
  api.onCreated.addListener((id, node) => {
    if (importing || !node.url || !node.parentId) return;
    pending.push({ id, parentId: node.parentId, on: automationNow() });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void runBatch().catch((error: unknown) => {
        console.error('[Rules] New bookmarks not tagged or moved:', error);
      });
    }, BATCH_WINDOW_MS);
  });
  api.onImportBegan?.addListener(() => {
    importing = true;
  });
  api.onImportEnded?.addListener(() => {
    importing = false;
  });
}
