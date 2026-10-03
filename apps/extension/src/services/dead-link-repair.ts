/**
 * Reviewed repairs for dead-link scan results. Nothing changes until the user applies a plan;
 * each change is re-checked against the live bookmark first, and an applied batch can be undone.
 */
import { z } from 'zod';

const config = readConfig(
  'network/dead-link-repair',
  z.strictObject({ archive_url_prefix: z.string().url() }),
);

export type DeadLinkRepairChoice = 'keep' | 'delete' | 'redirect' | 'archive' | 'edit';

export type DeadLinkRepairItem = {
  id: string;
  title: string;
  /** The URL the scan checked; the repair is skipped if the bookmark no longer has it. */
  scannedUrl: string;
  choice: DeadLinkRepairChoice;
  /** Replacement URL for `redirect`, `archive`, and `edit`. */
  newUrl?: string;
};

export type DeadLinkRepairSummary = { keep: number; delete: number; replace: number };

/** `changed`: deleted, moved to another URL, or otherwise edited since the scan. */
export type DeadLinkRepairIssue = BookmarkChangeIssue;

export type DeadLinkRepairOutcome = {
  deleted: number;
  replaced: number;
  skipped: number;
  failed: number;
  issues: DeadLinkRepairIssue[];
  /**
   * Reverts the batch once: puts replaced URLs back, then restores deleted bookmarks (within the
   * deletion undo window). A URL edited again since the repair is left alone and counted as
   * failed, so undo never overwrites a newer change.
   */
  undo: () => Promise<BookmarkChangesUndoResult>;
  /** After this time (epoch milliseconds) undo is no longer offered. */
  expiresAt: number;
};

/** Results the review lists: failures, timeouts, and redirects. */
export function isDeadLinkRepairCandidate(item: Pick<DeadLinkResultItem, 'status'>): boolean {
  return item.status === 'error' || item.status === 'timeout' || item.status === 'redirect';
}

/**
 * A Wayback Machine link that opens the latest archived copy. It is built locally, never
 * requested, so it can point at a page that was never archived.
 */
export function buildArchiveUrl(url: string): string {
  return `${config.archive_url_prefix}${url}`;
}

/** Replacement URLs must be web links; bookmarklets and browser pages cannot be chosen here. */
export function isValidRepairUrl(url: string): boolean {
  return isWebUrl(url.trim());
}

/** The URL a choice writes, or `undefined` for keep, delete, and an invalid or unchanged edit. */
export function resolveRepairUrl(item: DeadLinkRepairItem): string | undefined {
  if (item.choice === 'keep' || item.choice === 'delete') return undefined;
  const url = item.newUrl?.trim();
  if (!url || !isValidRepairUrl(url) || url === item.scannedUrl) return undefined;
  return url;
}

/** True when the item would change a bookmark if applied. */
export function isActionableRepair(item: DeadLinkRepairItem): boolean {
  return item.choice === 'delete' || resolveRepairUrl(item) !== undefined;
}

export function summarizeDeadLinkRepairs(items: DeadLinkRepairItem[]): DeadLinkRepairSummary {
  const summary: DeadLinkRepairSummary = { keep: 0, delete: 0, replace: 0 };
  for (const item of items) {
    if (item.choice === 'delete') summary.delete += 1;
    else if (resolveRepairUrl(item) !== undefined) summary.replace += 1;
    else summary.keep += 1;
  }
  return summary;
}

/** The bookmark change a reviewed choice makes; only for actionable items. */
function toBookmarkChange(item: DeadLinkRepairItem): BookmarkChange {
  const base = { id: item.id, title: item.title, expect: { url: item.scannedUrl } };
  return item.choice === 'delete'
    ? { ...base, kind: 'remove' }
    : { ...base, kind: 'update', set: { url: resolveRepairUrl(item) } };
}

/**
 * Applies the reviewed choices. A bookmark deleted or pointed at another URL since the scan is
 * skipped, so a stale scan never deletes or overwrites a newer edit.
 */
export async function applyDeadLinkRepairs(
  items: DeadLinkRepairItem[],
): Promise<DeadLinkRepairOutcome> {
  const actionable = items.filter(isActionableRepair);
  const result = await applyBookmarkChanges(actionable.map(toBookmarkChange));
  const notApplied = new Set(result.issues.map((issue) => issue.id));
  const applied = actionable.filter((item) => !notApplied.has(item.id));
  const deleted = applied.filter((item) => item.choice === 'delete').length;
  return {
    deleted,
    replaced: applied.length - deleted,
    skipped: result.skipped,
    failed: result.failed,
    issues: result.issues,
    undo: result.undo,
    expiresAt: result.expiresAt,
  };
}
