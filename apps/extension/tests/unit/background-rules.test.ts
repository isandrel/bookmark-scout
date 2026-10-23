/**
 * A reviewed Smart Rules run above the Apply in the Background Above setting, applied by an
 * `applyRules` background task: tags and moves in parts, the rule versions frozen in the task,
 * and what a stopped worker, Cancel, a restart, and an injected failure do to it (R26 to R29, R36).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import * as metadataStorage from '@/lib/bookmark-metadata-storage';
import { bookmarkMetadataValue } from '@/lib/bookmark-metadata-storage';
import { type BookmarkRule, planBookmarkRules, ruleVersion } from '@/lib/bookmark-rules';
import { bookmarkRulesValue } from '@/lib/bookmark-rules-storage';
import {
  acceptJob,
  claimJob,
  getJob,
  getJobItems,
  JOB_LIMITS,
  markItemsInFlight,
} from '@/lib/job-store';
import { jobCancelledNote, jobErrorMessage, jobTitle } from '@/lib/job-view';
import { ruleAutoLogValue } from '@/lib/rule-auto-log';
import { ruleRunStatusValue } from '@/lib/rule-run-status';
import { SEARCH_SYNTAX_VERSION } from '@/lib/search-query';
import { saveSettings } from '@/lib/settings-storage';
import * as bookmarkAudit from '@/services/bookmark-audit';
import { JOB_ADAPTERS } from '@/services/job-adapters';
import {
  resetJobCoordinatorForTests,
  runJobCommand,
  whenJobsIdle,
} from '@/services/job-coordinator';
import { applyRulePlan } from '@/services/rule-run';
import type { BookmarkTreeNode } from '@/types';
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

const TAG = 'development';
const SLICE = JOB_LIMITS.sliceMaxItems;
const COUNT = Math.ceil(SLICE * 2.5);
const ids = Array.from({ length: COUNT }, (_, index) => `b${index + 1}`);

const RULE: BookmarkRule = {
  id: 'gh',
  name: 'GitHub',
  enabled: true,
  query: 'domain:github.com',
  syntaxVersion: SEARCH_SYNTAX_VERSION,
  addTags: [TAG],
  moveTo: { folderId: 'to', path: 'To' },
};

let bookmarks: FakeBookmarks;

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  await resetAuditDatabase();
  resetJobCoordinatorForTests();
  installFakePermissions();
  await saveSettings({ language: 'en', jobsApplyInBackgroundAbove: SLICE });
  setLanguage('en');
  bookmarks = installFakeBookmarks([
    { id: 'from', title: 'From' },
    { id: 'to', title: 'To' },
    ...ids.map((id) => ({ id, parentId: 'from', title: id, url: `https://github.com/acme/${id}` })),
  ]);
  await bookmarkMetadataValue.set({});
  await ruleAutoLogValue.set([]);
  await ruleRunStatusValue.set({ rules: {} });
  await bookmarkRulesValue.set([RULE]);
});

afterEach(async () => {
  await whenJobsIdle().catch(() => undefined);
});

/** See `background-apply.test.ts`: parts of a hundred audited writes get room on a slow runner. */
const PART_WAIT_MS = 15_000;
const TEST_MS = 2 * PART_WAIT_MS;
const eventually = (check: () => void | Promise<void>) =>
  vi.waitFor(check, { timeout: PART_WAIT_MS });

/** The review of every bookmark, as the Tools sidebar's scan makes it. */
async function review() {
  const tree = (await fakeBrowser.bookmarks.getTree()) as BookmarkTreeNode[];
  return planBookmarkRules(await bookmarkRulesValue.get(), tree, await bookmarkMetadataValue.get());
}

/** Applies the whole review; it goes to a background task. Returns the task's id. */
async function applyInBackground() {
  const run = await applyRulePlan(await review());
  if (!run.background) throw new Error('applied in the page');
  return run.background.job.id;
}

/** Holds each part before it writes, until the test lets it go or frees the rest. */
function holdParts() {
  const adapter = JOB_ADAPTERS.applyRules;
  if (!('runBatch' in adapter)) throw new Error('not a part adapter');
  const runBatch = adapter.runBatch.bind(adapter);
  const waiting: (() => void)[] = [];
  const started: string[][] = [];
  let free = false;
  vi.spyOn(adapter, 'runBatch').mockImplementation(async (...args) => {
    if (!free) await new Promise<void>((resolve) => waiting.push(resolve));
    started.push(args[0].map((input) => (input as { id: string }).id));
    return runBatch(...args);
  });
  return {
    started,
    waiting: () => waiting.length,
    release: () => waiting.shift()?.(),
    freeAll: () => {
      free = true;
      for (const resolve of waiting.splice(0)) resolve();
    },
  };
}

const tagsOf = async (id: string) => (await bookmarkMetadataValue.get())[id]?.tags;
const taggedIds = async () => Object.keys(await bookmarkMetadataValue.get()).sort();
const runEntries = async () => (await ruleAutoLogValue.get()).filter((e) => e.kind === 'run');
const listedInLog = async () =>
  (await runEntries()).flatMap((entry) =>
    entry.kind === 'run' ? entry.tagged.flatMap((group) => group.bookmarkIds) : [],
  );
const moveWrites = (id: string) => bookmarks.writes.filter((write) => write === `move ${id}`);

describe('a large reviewed Smart Rules run as a background task', { timeout: TEST_MS }, () => {
  it('tags and moves in parts, one History record a part, one rules log entry, with the rule versions frozen', async () => {
    const jobId = await applyInBackground();
    await whenJobsIdle();
    const job = await getJob(jobId);
    expect(job).toMatchObject({
      kind: 'applyRules',
      state: 'succeeded',
      done: { succeeded: COUNT, skipped: 0, failed: 0 },
      options: { rules: { gh: ruleVersion(RULE) } },
    });
    expect(job && jobTitle(job)).toBe('Applying changes: Smart Rules');
    expect(bookmarks.childIds('to')).toHaveLength(COUNT);
    expect(await taggedIds()).toEqual([...ids].sort());
    const records = await auditRecords();
    expect(records).toHaveLength(3);
    expect(records.every((record) => record.jobId === jobId)).toBe(true);
    expect(records.map((record) => record.label.part?.index).sort()).toEqual([1, 2, 3]);
    // One durable record of the tags for the whole run, linked to the task.
    const [entry, ...others] = await runEntries();
    expect(others).toEqual([]);
    expect(entry).toMatchObject({ kind: 'run', jobId, moved: COUNT, omitted: 0 });
    expect((await listedInLog()).sort()).toEqual([...ids].sort());
    expect((await ruleRunStatusValue.get()).rules.gh).toMatchObject({
      tagged: COUNT,
      moved: COUNT,
      skipped: 0,
      jobId,
    });
  });

  it('reconciles a part a stopped worker left after moving: Resume moves nothing twice and counts each once (R26, R42)', async () => {
    const plan = await review();
    const { job: accepted } = await acceptJob({
      commandId: crypto.randomUUID(),
      kind: 'applyRules',
      source: 'manager',
      scope: { mode: 'all', rootIds: [], label: '' },
      options: { rules: { gh: ruleVersion(RULE) } },
      inputs: plan.map(({ id, title, url, parentId, ruleIds, addTags, move }) => ({
        id,
        title,
        url,
        parentId,
        ruleIds,
        addTags,
        ...(move ? { move } : {}),
      })),
      now: Date.now(),
    });
    const claimed = await claimJob(accepted.id, 'stopped-worker');
    if (!claimed) throw new Error('not claimed');
    const firstPart = Array.from({ length: SLICE }, (_, index) => index);
    await markItemsInFlight(accepted.id, claimed.generation, firstPart, Date.now());
    // The stopped worker tagged its part, moved ten, and stopped before saving any outcome.
    await bookmarkMetadataValue.set(
      Object.fromEntries(ids.slice(0, SLICE).map((id) => [id, { tags: [TAG] }])),
    );
    for (const id of ids.slice(0, 10)) await fakeBrowser.bookmarks.move(id, { parentId: 'to' });
    const writesBefore = bookmarks.writes.length;

    resetJobCoordinatorForTests();
    await runJobCommand({ type: 'pause', jobId: crypto.randomUUID() });
    await whenJobsIdle();
    const paused = await getJob(accepted.id);
    expect(paused).toMatchObject({ state: 'paused', lastError: { code: 'uncertain-write' } });
    // Nothing more was written on its own.
    expect(bookmarks.writes).toHaveLength(writesBefore);

    await runJobCommand({ type: 'resume', jobId: accepted.id });
    await whenJobsIdle();
    // Each item has one outcome: the ten already done count once, as done, never twice.
    expect(await getJob(accepted.id)).toMatchObject({
      state: 'succeeded',
      done: { succeeded: COUNT, skipped: 0, failed: 0 },
    });
    const items = await getJobItems(accepted.id, { limit: COUNT });
    expect(
      items
        .filter((item) => (item.result as { reason?: string }).reason === 'done')
        .map((item) => (item.result as { id: string }).id),
    ).toEqual(ids.slice(0, 10));
    expect(new Set(bookmarks.childIds('to')).size).toBe(COUNT);
    for (const id of ids) expect(moveWrites(id)).toHaveLength(1);
    for (const id of ids) expect(await tagsOf(id)).toEqual([TAG]);
  });

  it('stops between parts on Cancel, keeps what was applied with its record, and writes no more (R27)', async () => {
    const held = holdParts();
    const jobId = await applyInBackground();
    await eventually(() => expect(held.waiting()).toBe(1));
    held.release();
    await eventually(() => expect(held.waiting()).toBe(1));
    await runJobCommand({ type: 'cancel', jobId });
    // The part already writing finishes; no part starts after it.
    held.release();
    await whenJobsIdle();
    const job = await getJob(jobId);
    expect(job).toMatchObject({ state: 'cancelled', done: { succeeded: 2 * SLICE } });
    expect(job && jobCancelledNote(job)).toBe(
      'Stopped. The changes made so far stay: undo the moves from History and the tags under Changed by rules in Settings.',
    );
    expect(held.waiting()).toBe(0);
    expect(bookmarks.childIds('to')).toEqual(ids.slice(0, 2 * SLICE));
    expect(await taggedIds()).toEqual(ids.slice(0, 2 * SLICE).sort());
    expect((await listedInLog()).sort()).toEqual(ids.slice(0, 2 * SLICE).sort());
    expect(await auditRecords()).toHaveLength(2);
  });

  it('resumes after a restart as the same task with the same rule versions, on the remaining bookmarks only (R28)', async () => {
    const held = holdParts();
    const jobId = await applyInBackground();
    await eventually(() => expect(held.waiting()).toBe(1));
    await runJobCommand({ type: 'pause', jobId });
    held.release();
    await whenJobsIdle();
    const paused = await getJob(jobId);
    expect(paused).toMatchObject({ state: 'paused', done: { succeeded: SLICE } });

    // A browser restart: a new background, the job store kept.
    resetJobCoordinatorForTests();
    held.freeAll();
    await runJobCommand({ type: 'resume', jobId });
    await whenJobsIdle();
    const finished = await getJob(jobId);
    expect(finished).toMatchObject({
      id: jobId,
      state: 'succeeded',
      done: { succeeded: COUNT },
      options: paused?.options,
    });
    // The parts after the restart had only the bookmarks left.
    expect(held.started.slice(1).flat()).toEqual(ids.slice(SLICE));
    for (const id of ids) expect(moveWrites(id)).toHaveLength(1);
  });

  it('pauses on an injected storage failure with nothing counted, and on Resume tags and moves each once (R29)', async () => {
    const save = vi
      .spyOn(metadataStorage, 'mergeStoredBookmarkMetadata')
      .mockRejectedValueOnce(new Error('QuotaExceededError'));
    const jobId = await applyInBackground();
    await whenJobsIdle();
    const job = await getJob(jobId);
    expect(job).toMatchObject({ state: 'paused', lastError: { code: 'slice-setup' } });
    expect(job?.done).toEqual({ succeeded: 0, skipped: 0, failed: 0 });
    // Failed closed: the tags were not saved, so no move was made.
    expect(bookmarks.writes).toEqual([]);
    expect(await bookmarkMetadataValue.get()).toEqual({});
    const items = await getJobItems(jobId, { limit: COUNT });
    expect(items.every((item) => item.inFlightSince === undefined)).toBe(true);

    save.mockRestore();
    await runJobCommand({ type: 'resume', jobId });
    await whenJobsIdle();
    expect(await getJob(jobId)).toMatchObject({ state: 'succeeded', done: { succeeded: COUNT } });
    for (const id of ids) expect(await tagsOf(id)).toEqual([TAG]);
    for (const id of ids) expect(moveWrites(id)).toHaveLength(1);
    // The log lists each bookmark once, although its first part was recorded before it failed.
    expect((await listedInLog()).sort()).toEqual([...ids].sort());
  });

  it('moves nothing without its History record, then on Resume adds no tag twice (R25, R29, R42)', async () => {
    const audit = vi
      .spyOn(bookmarkAudit, 'beginAuditOperation')
      .mockRejectedValue(new Error('quota'));
    const jobId = await applyInBackground();
    await whenJobsIdle();
    expect(await getJob(jobId)).toMatchObject({
      state: 'paused',
      lastError: { code: 'slice-setup' },
      done: { succeeded: 0, skipped: 0, failed: 0 },
    });
    expect(bookmarks.childIds('to')).toEqual([]);
    // The first part's tags were saved before its moves were refused; they are on record.
    expect(await taggedIds()).toEqual(ids.slice(0, SLICE).sort());
    expect((await listedInLog()).sort()).toEqual(ids.slice(0, SLICE).sort());

    audit.mockRestore();
    await runJobCommand({ type: 'resume', jobId });
    await whenJobsIdle();
    expect(await getJob(jobId)).toMatchObject({ state: 'succeeded', done: { succeeded: COUNT } });
    expect(bookmarks.childIds('to')).toHaveLength(COUNT);
    for (const id of ids) expect(await tagsOf(id)).toEqual([TAG]);
  });

  it('skips the bookmarks of a rule edited mid-run, and pauses while Smart Rules is off (R14, R36)', async () => {
    const held = holdParts();
    const jobId = await applyInBackground();
    await eventually(() => expect(held.waiting()).toBe(1));
    held.release();
    await eventually(() => expect(held.waiting()).toBe(1));
    // Smart Rules turned off: the next part does not start.
    await saveSettings({ bookmarkRulesEnabled: false });
    held.release();
    await whenJobsIdle();
    const paused = await getJob(jobId);
    expect(paused).toMatchObject({
      state: 'paused',
      lastError: { code: 'rules-off' },
      done: { succeeded: SLICE },
    });
    expect(paused && jobErrorMessage(paused)).toBe(
      'Paused: Smart Rules was turned off in Settings. Turn it on and resume, or cancel.',
    );
    expect(bookmarks.childIds('to')).toHaveLength(SLICE);

    // Back on, but the rule now adds another tag: what the user reviewed no longer holds.
    await saveSettings({ bookmarkRulesEnabled: true });
    await bookmarkRulesValue.set([{ ...RULE, addTags: ['other'] }]);
    held.freeAll();
    await runJobCommand({ type: 'resume', jobId });
    await whenJobsIdle();
    expect(await getJob(jobId)).toMatchObject({
      state: 'succeeded',
      done: { succeeded: SLICE, skipped: COUNT - SLICE, failed: 0 },
    });
    const skipped = (await getJobItems(jobId, { limit: COUNT })).filter(
      (item) => item.outcome === 'skipped',
    );
    expect(
      skipped.every((item) => (item.result as { reason?: string }).reason === 'ruleChanged'),
    ).toBe(true);
    expect(bookmarks.childIds('to')).toHaveLength(SLICE);
    expect(await taggedIds()).toEqual(ids.slice(0, SLICE).sort());
    expect((await ruleRunStatusValue.get()).rules.gh).toMatchObject({
      tagged: SLICE,
      moved: SLICE,
      skipped: COUNT - SLICE,
    });
  });
});
