/**
 * The background jobs' storage: one summary per job (`jobs`) and one row per item of its work
 * (`items`), kept on this device in IndexedDB so a job outlives the page that started it, the
 * background worker, and a browser restart. `services/job-coordinator.ts` owns every state
 * change; pages only read, and hear about changes through `JOB_CHANNEL`.
 *
 * Every write is one transaction: an item's result and the job's counters commit together, and
 * a commit is refused unless the job is still owned by the same claim (`generation`), so a late
 * result from a paused, cancelled, or replaced run never counts. A command id is stored with the
 * job it started, so the same Start sent twice returns the same job.
 *
 * Records read back are validated; one that does not match its schema is reported as unreadable,
 * never run. No React here: the background uses it.
 */
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';

const schedulerConfig = readConfig(
  'jobs/scheduler',
  z.strictObject({
    slice_max_items: boundedNumber({ integer: true }),
    slice_max_ms: boundedNumber({ integer: true }),
    watchdog_minutes: boundedNumber({ integer: false }),
    retention_days: boundedNumber({ integer: true }),
    max_finished_jobs: boundedNumber({ integer: true }),
    max_items: boundedNumber({ integer: true }),
    page_size: boundedNumber({ integer: true }),
  }),
);

export const JOB_LIMITS = {
  sliceMaxItems: schedulerConfig.slice_max_items,
  sliceMaxMs: schedulerConfig.slice_max_ms,
  watchdogMinutes: schedulerConfig.watchdog_minutes,
  retentionMs: schedulerConfig.retention_days * MS_PER_DAY,
  maxFinishedJobs: schedulerConfig.max_finished_jobs,
  maxItems: schedulerConfig.max_items,
  pageSize: schedulerConfig.page_size,
} as const;

/** What a job does. Each kind has an adapter in the coordinator. */
export const JOB_KINDS = ['deadLinks', 'metadataFetcher', 'siteIcons', 'reorganization'] as const;
export type JobKind = (typeof JOB_KINDS)[number];

/** Why a job cannot go on until the user acts; each has a message (`JOB_BLOCK_KEYS` in `job-view.ts`). */
export const JOB_BLOCK_CODES = [
  'ai-off',
  'ai-not-set-up',
  'ai-service-changed',
  'ai-request',
  'uncertain-request',
  'slice-setup',
] as const;
export type JobBlockCode = (typeof JOB_BLOCK_CODES)[number];

/** Where a job was started from, as far as the extension knows. */
export const JOB_SOURCES = ['manager', 'popup', 'sidePanel'] as const;

/**
 * A job's state. `pause_requested` and `cancel_requested` hold while work already started
 * settles; `paused` and `cancelled` only once nothing more can land.
 */
export const JOB_STATES = [
  'queued',
  'running',
  'pause_requested',
  'paused',
  'cancel_requested',
  'cancelled',
  'succeeded',
  'partial',
  'failed',
] as const;
export type JobState = (typeof JOB_STATES)[number];

/** States in which work may still be dispatched or land. */
export const ACTIVE_JOB_STATES: ReadonlySet<JobState> = new Set([
  'queued',
  'running',
  'pause_requested',
  'cancel_requested',
]);
/** States that end a job; its results stay readable. */
export const FINISHED_JOB_STATES: ReadonlySet<JobState> = new Set([
  'cancelled',
  'succeeded',
  'partial',
  'failed',
]);

/** How an item ended: checked, skipped by rule (not a web address), or failed to check. */
export const ITEM_OUTCOMES = ['succeeded', 'skipped', 'failed'] as const;
export type ItemOutcome = (typeof ITEM_OUTCOMES)[number];

const SCHEMA_VERSION = 1;

const counts = z.strictObject({
  succeeded: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export const jobRecordSchema = z.strictObject({
  id: z.string().min(1),
  schemaVersion: z.literal(SCHEMA_VERSION),
  kind: z.enum(JOB_KINDS),
  commandId: z.string().min(1),
  source: z.enum(JOB_SOURCES),
  createdAt: z.number(),
  updatedAt: z.number(),
  /** Goes up with every change, so a view can tell an old snapshot from a new one. */
  revision: z.number().int().nonnegative(),
  state: z.enum(JOB_STATES),
  /** The folders the job covers, frozen when it was accepted; empty for all bookmarks. */
  scope: z.strictObject({
    mode: z.enum(['all', 'folder']),
    rootIds: z.array(z.string()),
    /** The folder's name at the start, for the list; never used to find it again. */
    label: z.string(),
  }),
  /** The kind's settings at the start, validated by its adapter; never secrets. */
  options: z.unknown(),
  /** Counts about the scope fixed at the start that no item shows (bookmarks never requested). */
  summary: z.record(z.string(), z.number().int().nonnegative()).optional(),
  total: z.number().int().nonnegative(),
  done: counts,
  /** Bumped by every claim; a result from an older claim is refused. */
  generation: z.number().int().nonnegative(),
  /** The background run that holds the claim, or none while the job waits. */
  ownerSession: z.string().optional(),
  /** Time spent running, without pauses and waits. */
  activeMs: z.number().nonnegative(),
  /** When the current run started, while running. */
  runningSince: z.number().optional(),
  finishedAt: z.number().optional(),
  /** Why the job stopped or cannot go on, without URLs or titles. */
  lastError: z.strictObject({ code: z.string(), message: z.string() }).optional(),
});
export type JobRecord = z.infer<typeof jobRecordSchema>;

export const jobItemSchema = z.strictObject({
  jobId: z.string(),
  index: z.number().int().nonnegative(),
  /** The work's input, validated by the kind's adapter. */
  input: z.unknown(),
  state: z.enum(['pending', 'done']),
  outcome: z.enum(ITEM_OUTCOMES).optional(),
  /** The result, validated by the kind's adapter; null until done. */
  result: z.unknown(),
  attempts: z.number().int().nonnegative(),
  /**
   * When a request that may cost money (an AI request) was sent for the item and its answer is
   * not saved yet. A stopped worker leaves it set, so the job asks the user before sending again.
   */
  inFlightSince: z.number().optional(),
});
export type JobItem = z.infer<typeof jobItemSchema>;

interface JobDb extends DBSchema {
  jobs: { key: string; value: JobRecord; indexes: { createdAt: number } };
  items: {
    key: [string, number];
    value: JobItem;
    indexes: { pending: [string, string, number] };
  };
  /** The job each Start command created, so a repeated Start returns it. */
  commands: { key: string; value: { commandId: string; jobId: string } };
}

export const JOB_DB_NAME = INDEXED_DATABASES.backgroundJobs.name;
const JOB_DB_VERSION = 1;

/** Broadcast name pages listen on: `{ jobId, revision }` after every change. */
export const JOB_CHANNEL = 'bookmark-scout-jobs';

export type JobChange = { jobId: string; revision: number };

/** The job store could not be opened or written. */
export class JobStoreError extends Error {
  constructor(readonly code: 'unavailable' | 'write-failed' | 'too-large') {
    super(t('error_jobStore'));
    this.name = 'JobStoreError';
  }
}

let database: Promise<IDBPDatabase<JobDb>> | undefined;

function openJobDb(): Promise<IDBPDatabase<JobDb>> {
  database ??= Promise.resolve()
    .then(() =>
      openDB<JobDb>(JOB_DB_NAME, JOB_DB_VERSION, {
        upgrade(db) {
          const jobs = db.createObjectStore('jobs', { keyPath: 'id' });
          jobs.createIndex('createdAt', 'createdAt');
          const items = db.createObjectStore('items', { keyPath: ['jobId', 'index'] });
          items.createIndex('pending', ['jobId', 'state', 'index']);
          db.createObjectStore('commands', { keyPath: 'commandId' });
        },
        // Another context opened a newer version: let it, and reopen on the next call.
        blocking() {
          void database?.then((db) => db.close());
          database = undefined;
        },
        terminated() {
          database = undefined;
        },
      }),
    )
    .catch((error: unknown) => {
      database = undefined;
      throw error instanceof JobStoreError ? error : new JobStoreError('unavailable');
    });
  return database;
}

/** For tests: forget the open connection. */
export async function closeJobDb(): Promise<void> {
  const open = database;
  database = undefined;
  if (open) (await open.catch(() => undefined))?.close();
}

function broadcast(change: JobChange): void {
  try {
    const channel = new BroadcastChannel(JOB_CHANNEL);
    channel.postMessage(change);
    channel.close();
  } catch {
    // No BroadcastChannel (some test environments): pages refresh on their next read.
  }
}

/** A stored job, or undefined when there is none or it is not readable. */
function parseJob(value: unknown): JobRecord | undefined {
  const parsed = jobRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export type NewJob = {
  commandId: string;
  kind: JobKind;
  source: JobRecord['source'];
  scope: JobRecord['scope'];
  options: unknown;
  summary?: JobRecord['summary'];
  /** The work, in order; each becomes one item. */
  inputs: readonly unknown[];
  now: number;
};

/**
 * Stores a new job with all its items in one transaction, or returns the job this command
 * already created. Throws when the store cannot be written; nothing is half stored.
 */
export async function acceptJob(job: NewJob): Promise<{ job: JobRecord; created: boolean }> {
  if (job.inputs.length > JOB_LIMITS.maxItems) throw new JobStoreError('too-large');
  const db = await openJobDb();
  const tx = db.transaction(['jobs', 'items', 'commands'], 'readwrite');
  const existing = await tx.objectStore('commands').get(job.commandId);
  if (existing) {
    const stored = parseJob(await tx.objectStore('jobs').get(existing.jobId));
    await tx.done;
    if (stored) return { job: stored, created: false };
    throw new JobStoreError('write-failed');
  }
  const record: JobRecord = {
    id: crypto.randomUUID(),
    schemaVersion: SCHEMA_VERSION,
    kind: job.kind,
    commandId: job.commandId,
    source: job.source,
    createdAt: job.now,
    updatedAt: job.now,
    revision: 0,
    state: 'queued',
    scope: job.scope,
    options: job.options,
    ...(job.summary ? { summary: job.summary } : {}),
    total: job.inputs.length,
    done: { succeeded: 0, skipped: 0, failed: 0 },
    generation: 0,
    activeMs: 0,
  };
  void tx.objectStore('jobs').add(record);
  void tx.objectStore('commands').add({ commandId: job.commandId, jobId: record.id });
  const items = tx.objectStore('items');
  job.inputs.forEach((input, index) => {
    void items.add({ jobId: record.id, index, input, state: 'pending', result: null, attempts: 0 });
  });
  try {
    await tx.done;
  } catch {
    throw new JobStoreError('write-failed');
  }
  broadcast({ jobId: record.id, revision: record.revision });
  return { job: record, created: true };
}

export async function getJob(id: string): Promise<JobRecord | undefined> {
  const db = await openJobDb();
  return parseJob(await db.get('jobs', id));
}

/** The newest jobs first, at most `limit`; unreadable records are left out. */
export async function listJobs(limit = JOB_LIMITS.maxFinishedJobs): Promise<JobRecord[]> {
  const db = await openJobDb();
  const jobs: JobRecord[] = [];
  let cursor = await db.transaction('jobs').store.index('createdAt').openCursor(null, 'prev');
  while (cursor && jobs.length < limit) {
    const job = parseJob(cursor.value);
    if (job) jobs.push(job);
    cursor = await cursor.continue();
  }
  return jobs;
}

/** A page of a job's items in order, from `from`. */
export async function getJobItems(
  jobId: string,
  { from = 0, limit = JOB_LIMITS.pageSize }: { from?: number; limit?: number } = {},
): Promise<JobItem[]> {
  const db = await openJobDb();
  const range = IDBKeyRange.bound([jobId, from], [jobId, Number.MAX_SAFE_INTEGER]);
  const rows = await db.getAll('items', range, limit);
  return rows.flatMap((row) => {
    const parsed = jobItemSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Up to `limit` items still to do, in order, leaving out those in `exclude` (in flight). */
export async function getPendingItems(
  jobId: string,
  limit: number,
  exclude: ReadonlySet<number> = new Set(),
): Promise<JobItem[]> {
  const db = await openJobDb();
  const range = IDBKeyRange.bound(
    [jobId, 'pending', 0],
    [jobId, 'pending', Number.MAX_SAFE_INTEGER],
  );
  const found: JobItem[] = [];
  let cursor = await db.transaction('items').store.index('pending').openCursor(range);
  while (cursor && found.length < limit) {
    const parsed = jobItemSchema.safeParse(cursor.value);
    if (parsed.success && !exclude.has(parsed.data.index)) found.push(parsed.data);
    cursor = await cursor.continue();
  }
  return found;
}

/**
 * Changes a job's state in one transaction when it is in one of `from`, applying `patch`, and
 * returns it; undefined when it is not (another change came first). Every change bumps the
 * revision.
 */
export async function transitionJob(
  jobId: string,
  from: readonly JobState[],
  to: JobState,
  patch: (job: JobRecord) => Partial<JobRecord> = () => ({}),
  now = Date.now(),
): Promise<JobRecord | undefined> {
  const db = await openJobDb();
  const tx = db.transaction('jobs', 'readwrite');
  const job = parseJob(await tx.store.get(jobId));
  if (!job || !from.includes(job.state)) {
    await tx.done;
    return undefined;
  }
  const next: JobRecord = {
    ...job,
    ...patch(job),
    state: to,
    revision: job.revision + 1,
    updatedAt: now,
  };
  await tx.store.put(next);
  await tx.done;
  broadcast({ jobId, revision: next.revision });
  return next;
}

/**
 * Claims a job for a run of this background (`session`): a new generation, so anything a
 * previous run still sends is refused. Only a waiting job, or a running one whose owner is gone,
 * can be claimed.
 */
export async function claimJob(
  jobId: string,
  session: string,
  now = Date.now(),
): Promise<JobRecord | undefined> {
  return transitionJob(
    jobId,
    ['queued', 'running'],
    'running',
    (job) =>
      job.state === 'running' && job.ownerSession === session
        ? {}
        : { generation: job.generation + 1, ownerSession: session, runningSince: now },
    now,
  );
}

/**
 * Stores one item's result and counts it, in one transaction, only while `generation` still owns
 * the job and the item is still to do. Returns the job after the change, or undefined when the
 * result was refused (late, duplicate, or from an older run).
 */
export async function commitItem(
  jobId: string,
  generation: number,
  index: number,
  outcome: ItemOutcome,
  result: unknown,
  now = Date.now(),
): Promise<JobRecord | undefined> {
  const db = await openJobDb();
  const tx = db.transaction(['jobs', 'items'], 'readwrite');
  const job = parseJob(await tx.objectStore('jobs').get(jobId));
  const item = await tx.objectStore('items').get([jobId, index]);
  const owned =
    job !== undefined &&
    job.generation === generation &&
    (job.state === 'running' ||
      job.state === 'pause_requested' ||
      job.state === 'cancel_requested');
  if (!job || !owned || !item || item.state !== 'pending') {
    await tx.done;
    return undefined;
  }
  const { inFlightSince: _answered, ...settled } = item;
  await tx.objectStore('items').put({
    ...settled,
    state: 'done',
    outcome,
    result,
    attempts: item.attempts + 1,
  });
  const next: JobRecord = {
    ...job,
    done: { ...job.done, [outcome]: job.done[outcome] + 1 },
    revision: job.revision + 1,
    updatedAt: now,
  };
  await tx.objectStore('jobs').put(next);
  try {
    await tx.done;
  } catch {
    throw new JobStoreError('write-failed');
  }
  broadcast({ jobId, revision: next.revision });
  return next;
}

/**
 * Marks a pending item as having a request in flight (`since`), or clears the mark once the
 * request ended without a result to save. Refused, like a commit, unless the claim holds.
 */
export async function markItemInFlight(
  jobId: string,
  generation: number,
  index: number,
  since: number | undefined,
): Promise<boolean> {
  const db = await openJobDb();
  const tx = db.transaction(['jobs', 'items'], 'readwrite');
  const job = parseJob(await tx.objectStore('jobs').get(jobId));
  const item = await tx.objectStore('items').get([jobId, index]);
  if (!job || job.generation !== generation || !item || item.state !== 'pending') {
    await tx.done;
    return false;
  }
  const { inFlightSince: _previous, ...rest } = item;
  await tx.objectStore('items').put(since === undefined ? rest : { ...rest, inFlightSince: since });
  await tx.done;
  return true;
}

/** Pending items whose request may have reached the provider with no answer saved. */
export async function getInFlightItems(jobId: string): Promise<JobItem[]> {
  const pending = await getPendingItems(jobId, Number.MAX_SAFE_INTEGER);
  return pending.filter((item) => item.inFlightSince !== undefined);
}

/** Clears every in-flight mark of a job: the user chose to send those requests again. */
export async function clearInFlightItems(jobId: string): Promise<void> {
  const items = await getInFlightItems(jobId);
  if (items.length === 0) return;
  const db = await openJobDb();
  const tx = db.transaction('items', 'readwrite');
  for (const { inFlightSince: _sent, ...item } of items) void tx.store.put(item);
  await tx.done;
}

/** Items done so far: succeeded, skipped, and failed. */
export function processedCount(job: Pick<JobRecord, 'done'>): number {
  return job.done.succeeded + job.done.skipped + job.done.failed;
}

/**
 * Removes finished jobs past their retention, and the oldest past the cap, with their items.
 * Active, paused, and unreadable jobs are never removed here.
 */
export async function pruneJobs(now = Date.now()): Promise<number> {
  const db = await openJobDb();
  const all = (await db.getAll('jobs')).flatMap((value) => parseJob(value) ?? []);
  const finished = all
    .filter((job) => FINISHED_JOB_STATES.has(job.state))
    .sort((a, b) => b.createdAt - a.createdAt);
  const remove = finished.filter(
    (job, position) =>
      position >= JOB_LIMITS.maxFinishedJobs ||
      now - (job.finishedAt ?? job.updatedAt) > JOB_LIMITS.retentionMs,
  );
  for (const job of remove) await deleteJob(job.id);
  return remove.length;
}

/** Deletes a job with its items and command; only for finished jobs. */
export async function deleteJob(jobId: string): Promise<boolean> {
  const db = await openJobDb();
  const tx = db.transaction(['jobs', 'items', 'commands'], 'readwrite');
  const job = parseJob(await tx.objectStore('jobs').get(jobId));
  if (!job || !FINISHED_JOB_STATES.has(job.state)) {
    await tx.done;
    return false;
  }
  await tx.objectStore('jobs').delete(jobId);
  await tx
    .objectStore('items')
    .delete(IDBKeyRange.bound([jobId, 0], [jobId, Number.MAX_SAFE_INTEGER]));
  await tx.objectStore('commands').delete(job.commandId);
  await tx.done;
  broadcast({ jobId, revision: job.revision + 1 });
  return true;
}
