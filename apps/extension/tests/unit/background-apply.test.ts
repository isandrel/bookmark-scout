import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { claimJob, getJob, getJobItems, JOB_LIMITS, markItemsInFlight } from '@/lib/job-store';
import { saveSettings } from '@/lib/settings-storage';
import * as bookmarkAudit from '@/services/bookmark-audit';
import { undoBookmarkChange } from '@/services/bookmark-history';
import type { BookmarkChange } from '@/services/bookmarks';
import { JOB_ADAPTERS } from '@/services/job-adapters';
import {
  resetJobCoordinatorForTests,
  runJobCommand,
  whenJobsIdle,
} from '@/services/job-coordinator';
import { applyReviewedChanges } from '@/services/reviewed-apply';
import { type FakeBookmarks, installFakeBookmarks } from '../fake-bookmarks';
import { installFakePermissions } from '../fake-permissions';
import { auditRecords, resetAuditDatabase } from './audit-helpers';

// The page sends the command to the background by message; here it goes straight to the
// coordinator the background runs.
vi.mock('@/services/job-protocol', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/job-protocol')>();
  return {
    ...actual,
    sendJobCommand: (command: Parameters<typeof runJobCommand>[0]) => runJobCommand(command),
  };
});

/** Bookmarks in "From", and a move of each into "To" as a reviewed tool would make it. */
const COUNT = Math.ceil(JOB_LIMITS.sliceMaxItems * 2.5);
const ids = Array.from({ length: COUNT }, (_, index) => `b${index + 1}`);
const moves: BookmarkChange[] = ids.map((id) => ({
  kind: 'move',
  id,
  title: id,
  expect: { parentId: 'from' },
  to: { parentId: 'to' },
}));

let bookmarks: FakeBookmarks;

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  await resetAuditDatabase();
  resetJobCoordinatorForTests();
  installFakePermissions();
  await saveSettings({ language: 'en', jobsApplyInBackgroundAbove: JOB_LIMITS.sliceMaxItems });
  bookmarks = installFakeBookmarks([
    { id: 'from', title: 'From' },
    { id: 'to', title: 'To' },
    ...ids.map((id) => ({ id, parentId: 'from', title: id, url: `https://e2e.invalid/${id}` })),
  ]);
});

afterEach(async () => {
  await whenJobsIdle().catch(() => undefined);
});

/**
 * A part is a hundred writes, each with its History record; on a loaded CI runner measuring
 * coverage that took more than a second, so waits for a part and the tests that wait on two get
 * room well beyond it.
 */
const PART_WAIT_MS = 15_000;
const TWO_PARTS_TEST_MS = 2 * PART_WAIT_MS;
const eventually = (check: () => void) => vi.waitFor(check, { timeout: PART_WAIT_MS });

/** Holds each part before it writes, until the test lets it go or frees the rest. */
function holdParts() {
  const adapter = JOB_ADAPTERS.applyChanges;
  if (!('runBatch' in adapter)) throw new Error('not a part adapter');
  const runBatch = adapter.runBatch.bind(adapter);
  const waiting: (() => void)[] = [];
  let free = false;
  vi.spyOn(adapter, 'runBatch').mockImplementation(async (...args) => {
    if (!free) await new Promise<void>((resolve) => waiting.push(resolve));
    return runBatch(...args);
  });
  return {
    waiting: () => waiting.length,
    release: () => waiting.shift()?.(),
    freeAll: () => {
      free = true;
      for (const resolve of waiting.splice(0)) resolve();
    },
  };
}

/** Starts applying `changes` as a background task and returns its id. */
async function applyInBackground(changes: BookmarkChange[]) {
  const applied = await applyReviewedChanges(changes, { tool: 'tools_aiReorganize' });
  if (!applied.background) throw new Error('applied in the page');
  return applied.job.id;
}

const parts = (records: Awaited<ReturnType<typeof auditRecords>>) =>
  records
    .filter((record) => record.label.part)
    .map((record) => [record.label.part?.index, record.label.part?.of, record.counts.applied])
    .sort(([a], [b]) => Number(a) - Number(b));

describe('applying reviewed changes', () => {
  it('applies up to the Apply in the Background Above setting at once, with Undo', async () => {
    const applied = await applyReviewedChanges(moves.slice(0, JOB_LIMITS.sliceMaxItems), {
      tool: 'tools_aiReorganize',
    });
    if (applied.background) throw new Error('went to the background');
    expect(applied.result.applied).toBe(JOB_LIMITS.sliceMaxItems);
    expect(typeof applied.result.undo).toBe('function');
  });

  it('applies above the Apply in the Background Above setting as a background task, one History record a part (J46)', async () => {
    const applied = await applyReviewedChanges(moves, { tool: 'tools_aiReorganize' });
    if (!applied.background) throw new Error('applied in the page');
    await whenJobsIdle();
    expect(await getJob(applied.job.id)).toMatchObject({
      state: 'succeeded',
      kind: 'applyChanges',
      done: { succeeded: COUNT },
    });
    expect(bookmarks.childIds('to')).toHaveLength(COUNT);
    const records = await auditRecords();
    expect(parts(records)).toEqual([
      [1, 3, JOB_LIMITS.sliceMaxItems],
      [2, 3, JOB_LIMITS.sliceMaxItems],
      [3, 3, COUNT - 2 * JOB_LIMITS.sliceMaxItems],
    ]);
    expect(records.every((record) => record.jobId === applied.job.id)).toBe(true);
  });

  it('keeps a change with a check in the page, where its code can run', async () => {
    const checked = moves.map((move) => ({ ...move, check: () => true }));
    const applied = await applyReviewedChanges(checked, { tool: 'tools_findDuplicates' });
    expect(applied.background).toBe(false);
  });

  it('pauses a part a stopped worker left halfway, and on Resume skips what was already changed (J43, J44)', async () => {
    // A worker took the first part, moved some of it, and stopped before saving any outcome.
    const { job: accepted } = await acceptJob({
      commandId: crypto.randomUUID(),
      kind: 'applyChanges',
      source: 'manager',
      scope: { mode: 'all', rootIds: [], label: '' },
      options: { tool: 'tools_aiReorganize' },
      inputs: moves,
      now: Date.now(),
    });
    const claimed = await claimJob(accepted.id, 'stopped-worker');
    if (!claimed) throw new Error('not claimed');
    const firstPart = Array.from({ length: JOB_LIMITS.sliceMaxItems }, (_, index) => index);
    await markItemsInFlight(accepted.id, claimed.generation, firstPart, Date.now());
    for (const id of ids.slice(0, 10)) await fakeBrowser.bookmarks.move(id, { parentId: 'to' });

    resetJobCoordinatorForTests();
    await runJobCommand({ type: 'pause', jobId: crypto.randomUUID() });
    await whenJobsIdle();
    expect(await getJob(accepted.id)).toMatchObject({
      state: 'paused',
      lastError: { code: 'uncertain-write' },
    });
    // Nothing more was written on its own.
    expect(bookmarks.childIds('to')).toHaveLength(10);

    await runJobCommand({ type: 'resume', jobId: accepted.id });
    await whenJobsIdle();
    expect(await getJob(accepted.id)).toMatchObject({
      state: 'succeeded',
      done: { succeeded: COUNT - 10, skipped: 10 },
    });
    // Each bookmark moved once: the ten already in "To" were skipped, not moved again.
    expect(bookmarks.childIds('to')).toHaveLength(COUNT);
    expect(new Set(bookmarks.childIds('to')).size).toBe(COUNT);
    const skipped = (await getJobItems(accepted.id))
      .filter((item) => item.outcome === 'skipped')
      .map((item) => (item.result as { id: string }).id);
    expect(skipped).toEqual(ids.slice(0, 10));
  });

  it(
    'waits for a part already writing before it pauses, then goes on after a change made since (J16, J42)',
    async () => {
      const held = holdParts();
      const jobId = await applyInBackground(moves);
      await eventually(() => expect(held.waiting()).toBe(1));
      await runJobCommand({ type: 'pause', jobId });
      // A part's writes cannot be stopped halfway: pausing waits for it.
      expect((await getJob(jobId))?.state).toBe('pause_requested');
      held.release();
      await whenJobsIdle();
      expect(await getJob(jobId)).toMatchObject({
        state: 'paused',
        done: { succeeded: JOB_LIMITS.sliceMaxItems },
      });
      expect(bookmarks.childIds('to')).toHaveLength(JOB_LIMITS.sliceMaxItems);

      // While paused, a bookmark of a later part is moved elsewhere.
      const elsewhere = await fakeBrowser.bookmarks.create({ title: 'Elsewhere' });
      const later = ids[JOB_LIMITS.sliceMaxItems + 1] ?? '';
      await fakeBrowser.bookmarks.move(later, { parentId: elsewhere.id });
      held.freeAll();
      await runJobCommand({ type: 'resume', jobId });
      await whenJobsIdle();
      expect(await getJob(jobId)).toMatchObject({
        state: 'succeeded',
        done: { succeeded: COUNT - 1, skipped: 1 },
      });
      expect(bookmarks.childIds(elsewhere.id)).toEqual([later]);
    },
    TWO_PARTS_TEST_MS,
  );

  it(
    'keeps the parts applied when cancelled, finishes the part writing, and starts no more (J14)',
    async () => {
      const held = holdParts();
      const jobId = await applyInBackground(moves);
      await eventually(() => expect(held.waiting()).toBe(1));
      held.release();
      // The first part is applied and saved; the second is about to write.
      await eventually(() => expect(held.waiting()).toBe(1));
      await runJobCommand({ type: 'cancel', jobId });
      held.release();
      await whenJobsIdle();
      const job = await getJob(jobId);
      expect(job?.state).toBe('cancelled');
      expect(job?.done.succeeded).toBe(2 * JOB_LIMITS.sliceMaxItems);
      expect(bookmarks.childIds('to')).toHaveLength(2 * JOB_LIMITS.sliceMaxItems);
      expect(held.waiting()).toBe(0);
      // Nothing applied is undone by the cancel; each part has its History record.
      expect(parts(await auditRecords())).toHaveLength(2);
    },
    TWO_PARTS_TEST_MS,
  );

  it('removes nothing when the record of what goes cannot be kept (J45)', async () => {
    vi.spyOn(bookmarkAudit, 'beginAuditOperation').mockRejectedValue(new Error('quota'));
    const removals: BookmarkChange[] = ids.map((id) => ({
      kind: 'remove',
      id,
      title: id,
      expect: { parentId: 'from' },
    }));
    const jobId = await applyInBackground(removals);
    await whenJobsIdle();
    const job = await getJob(jobId);
    expect(job?.state).toBe('failed');
    expect(job?.done).toEqual({ succeeded: 0, skipped: 0, failed: 0 });
    expect(bookmarks.childIds('from')).toHaveLength(COUNT);
    // Nothing is left marked as maybe written.
    const items = await getJobItems(jobId, { limit: COUNT });
    expect(items.every((item) => item.inFlightSince === undefined)).toBe(true);
  });

  it('undoes a finished background task part by part with Ctrl+Z (J48)', async () => {
    await whenJobsIdle();
    await applyInBackground(moves);
    await whenJobsIdle();
    expect(bookmarks.childIds('to')).toHaveLength(COUNT);
    await undoBookmarkChange();
    expect(bookmarks.childIds('from')).toHaveLength(COUNT - 2 * JOB_LIMITS.sliceMaxItems);
    await undoBookmarkChange();
    expect(bookmarks.childIds('from')).toHaveLength(COUNT - JOB_LIMITS.sliceMaxItems);
  });
});
