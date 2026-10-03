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

export type DeadLinkRepairIssue = {
  id: string;
  title: string;
  /** `changed`: deleted, moved to another URL, or otherwise edited since the scan. */
  reason: 'changed' | 'failed';
};

type ReplacedUrl = { id: string; previousUrl: string; newUrl: string };

export type DeadLinkRepairOutcome = {
  deleted: number;
  replaced: number;
  skipped: number;
  failed: number;
  issues: DeadLinkRepairIssue[];
  /** What {@link undoDeadLinkRepairs} reverts, in the order it was applied. */
  deletions: BookmarkDeletionSnapshot[];
  replacements: ReplacedUrl[];
};

export type DeadLinkUndoResult = { restored: number; failed: number };

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

async function readCurrentUrl(id: string): Promise<string | undefined> {
  try {
    return (await getBookmark(id)).url;
  } catch {
    return undefined;
  }
}

/**
 * Applies the reviewed choices. A bookmark deleted or pointed at another URL since the scan is
 * skipped, so a stale scan never deletes or overwrites a newer edit.
 */
export async function applyDeadLinkRepairs(
  items: DeadLinkRepairItem[],
): Promise<DeadLinkRepairOutcome> {
  const outcome: DeadLinkRepairOutcome = {
    deleted: 0,
    replaced: 0,
    skipped: 0,
    failed: 0,
    issues: [],
    deletions: [],
    replacements: [],
  };
  const report = (item: DeadLinkRepairItem, reason: DeadLinkRepairIssue['reason']) => {
    if (reason === 'changed') outcome.skipped += 1;
    else outcome.failed += 1;
    outcome.issues.push({ id: item.id, title: item.title, reason });
  };

  for (const item of items) {
    if (!isActionableRepair(item)) continue;
    if ((await readCurrentUrl(item.id)) !== item.scannedUrl) {
      report(item, 'changed');
      continue;
    }
    try {
      if (item.choice === 'delete') {
        const snapshot = await captureBookmarkDeletion(item.id);
        await deleteBookmark(item.id);
        outcome.deletions.push(snapshot);
        outcome.deleted += 1;
      } else {
        const newUrl = resolveRepairUrl(item) as string;
        await updateBookmark(item.id, { url: newUrl });
        outcome.replacements.push({ id: item.id, previousUrl: item.scannedUrl, newUrl });
        outcome.replaced += 1;
      }
    } catch {
      report(item, 'failed');
    }
  }
  return outcome;
}

/**
 * Reverts an applied batch: restores deleted bookmarks (within the deletion undo window) and
 * puts replaced URLs back. A URL edited again since the repair is left alone and counted as
 * failed, so undo never overwrites a newer change.
 */
export async function undoDeadLinkRepairs(
  outcome: Pick<DeadLinkRepairOutcome, 'deletions' | 'replacements'>,
): Promise<DeadLinkUndoResult> {
  const result: DeadLinkUndoResult = { restored: 0, failed: 0 };
  for (const replacement of [...outcome.replacements].reverse()) {
    try {
      if ((await readCurrentUrl(replacement.id)) !== replacement.newUrl) {
        result.failed += 1;
        continue;
      }
      await updateBookmark(replacement.id, { url: replacement.previousUrl });
      result.restored += 1;
    } catch {
      result.failed += 1;
    }
  }
  // Reverse deletion order keeps the captured sibling indexes valid.
  for (const snapshot of [...outcome.deletions].reverse()) {
    try {
      await restoreBookmarkDeletion(snapshot);
      result.restored += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}
