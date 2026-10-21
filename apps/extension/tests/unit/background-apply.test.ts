import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { claimJob, getJob, getJobItems, JOB_LIMITS, markItemsInFlight } from '@/lib/job-store';
import { saveSettings } from '@/lib/settings-storage';
import type { BookmarkChange } from '@/services/bookmarks';
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
});
