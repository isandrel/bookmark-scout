/**
 * Tag New Bookmarks: while the setting is on, the enabled Smart Rules add their tags to bookmarks
 * as they are added. Runs in the background, whose bookmark listener is added synchronously at
 * start, so it works with every page closed.
 *
 * - **Tags only:** a rule's move is never made automatically; moves stay with the reviewed run.
 * - **No loops:** tags are stored apart from the bookmarks and cause no bookmark event, and a tag
 *   the bookmark already has is not added again, so handling an event twice changes nothing.
 * - **Where from:** the browser does not say who added a bookmark, so this covers the browser's
 *   star, other extensions, and sync as well as Bookmark Scout. Bookmarks added together are
 *   handled in one batch, and a batch larger than `max_batch` (a sync or an import) is left
 *   alone, as are bookmarks the browser imports.
 * - **Fresh:** the bookmark is read again when its batch runs; one deleted by then is skipped. A
 *   bookmark added while the setting was off is never tagged, even when it is turned on before
 *   the batch runs.
 *
 * No React here.
 */

const { batch_window_ms: BATCH_WINDOW_MS, max_batch: MAX_BATCH } = BOOKMARK_RULE_LIMITS.auto_tag;

/**
 * Adds the tags enabled rules give to `ids`, when they are still bookmarks; returns how many
 * bookmarks got tags. Rule moves are left out.
 */
export async function autoTagBookmarks(ids: readonly string[]): Promise<number> {
  const rules = (await bookmarkRulesValue.get()).filter(
    (rule) => rule.enabled && rule.addTags.length > 0,
  );
  if (rules.length === 0 || ids.length === 0) return 0;
  const tagOnly = rules.map(({ moveTo: _move, ...rule }) => rule);
  const tree = await fetchBookmarkTree();
  const metadata = await getStoredBookmarkMetadata([...ids]);
  const plan = planBookmarkRules(tagOnly, tree, metadata, new Set(ids)).filter(
    (item) => item.addTags.length > 0,
  );
  if (plan.length === 0) return 0;
  await mergeStoredBookmarkMetadata(
    Object.fromEntries(plan.map((item) => [item.id, { tags: item.addTags }])),
    { tagMode: 'append', summaryMode: 'replace', dedupeTags: true },
  );
  return plan.length;
}

/** A bookmark waiting for its batch, with whether the setting was on when it was added. */
type Pending = { id: string; on: Promise<boolean> };

let pending: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let importing = false;

async function isOn(): Promise<boolean> {
  const settings = await getSettings();
  return settings.bookmarkRulesEnabled && settings.bookmarkRulesAutoTag;
}

async function runBatch(): Promise<void> {
  const batch = pending;
  pending = [];
  timer = undefined;
  if (batch.length > MAX_BATCH) return;
  // Only bookmarks added while the setting was on, and only while it still is.
  const added = await Promise.all(batch.map(async ({ id, on }) => ((await on) ? [id] : [])));
  if (!(await isOn())) return;
  await autoTagBookmarks(added.flat());
}

/** Starts Tag New Bookmarks. Call synchronously at background start. */
export function registerRuleAutoTag(): void {
  const api = browser.bookmarks;
  api.onCreated.addListener((id, node) => {
    if (importing || !node.url) return;
    pending.push({ id, on: isOn() });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void runBatch().catch((error: unknown) => {
        console.error('[Rules] New bookmarks not tagged:', error);
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
