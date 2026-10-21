/**
 * Runs background jobs: long tools that keep going when the page that started them closes, and
 * pick up again after the browser stops the background worker or restarts. The background owns
 * every job; pages send commands (`services/job-protocol.ts`) and read progress and results from
 * the job store (`lib/job-store.ts`).
 *
 * - **Accepting:** a Start is stored with its frozen scope and every item before it is answered,
 *   so a closed page cannot lose it, and the same command id returns the same job.
 * - **Running:** a run claims the job (a new generation) and works through its items in slices,
 *   a few at a time; each result and the counters commit together, and only while the claim
 *   holds. A check that was stopped is left to do, never counted.
 * - **Pause and cancel:** recorded first; work in flight is stopped, and `paused` or `cancelled`
 *   is set only once nothing more can land. Cancel keeps every result so far; it undoes nothing.
 * - **Waking up:** listeners are registered synchronously by the background, and every wake-up
 *   (a command, the watchdog alarm, browser start) reconciles: a job a previous worker was
 *   running starts again from its saved items, one that was pausing is paused, one that was
 *   cancelling is cancelled. A paused job stays paused across restarts.
 *
 * What it does not promise: work while the browser is closed, exact alarm timing, or that a site
 * did not see a request that was stopped in flight. Jobs only read; repairs stay reviewed page
 * actions through the audited bookmark writer.
 */
import { z } from 'zod';

/** This background run; a job claimed by another one was left behind by a stopped worker. */
const SESSION = crypto.randomUUID();
const JOB_ALARM = 'bookmark-scout:jobs';

type JobRun = { outcome: ItemOutcome; result: unknown };

/** How one kind of job does its work, from its frozen options and stored inputs. */
type JobAdapter = {
  /** The inputs (one per item) and options for a new job; read when the job is accepted. */
  prepare(scope: JobCommand & { type: 'start' }): Promise<{
    inputs: unknown[];
    options: unknown;
    label: string;
  }>;
  /** Items checked at the same time. */
  concurrency(options: unknown): number;
  /** Does one item; throws `RequestAbortedError` when stopped, which leaves it to do. */
  run(input: unknown, options: unknown, signal: AbortSignal): Promise<JobRun>;
};

const deadLinkOptionsSchema = z.strictObject({
  requestTimeoutMs: z.number().int().positive(),
  concurrency: z.number().int().positive(),
  retryCount: z.number().int().nonnegative(),
  followRedirects: z.boolean(),
  successStatuses: z.array(httpStatusCodeSchema),
  allSitesAccess: z.boolean().optional(),
});
const deadLinkTargetSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  folderPath: z.string(),
});

/** The bookmarks of a Start's scope, read from the browser now, never from a page's tree. */
async function scopeNodes(command: JobCommand & { type: 'start' }) {
  const tree = await fetchBookmarkTree();
  const folderId = command.scope.mode === 'folder' ? command.scope.folderId : null;
  const nodes = getScopedNodes(tree, folderId, command.scope.mode);
  const label = folderId ? getBookmarkDisplayTitle(nodes[0]?.title) : '';
  return { nodes, label };
}

const ADAPTERS: Record<JobKind, JobAdapter> = {
  deadLinks: {
    async prepare(command) {
      const { nodes, label } = await scopeNodes(command);
      const settings = await getSettings();
      const options = {
        ...getToolOptions(settings).deadLinks,
        // Granted only the bookmarks' own sites, a redirect elsewhere is not a confirmed loop.
        allSitesAccess: await hasPermission('webAccess'),
      };
      return { inputs: deadLinkTargets(nodes), options, label };
    },
    concurrency: (options) => deadLinkOptionsSchema.parse(options).concurrency,
    async run(input, options, signal) {
      const result = await checkDeadLink(
        deadLinkTargetSchema.parse(input),
        deadLinkOptionsSchema.parse(options),
        signal,
      );
      // Not a web address: nothing to check.
      const skipped = result.status === 'skipped' || result.status === 'invalid';
      return { outcome: skipped ? 'skipped' : 'succeeded', result };
    },
  },
};

/** The job running in this background, with what stops its work in flight. */
type ActiveRun = {
  generation: number;
  controllers: Set<AbortController>;
  stop?: 'pause' | 'cancel';
};
const active = new Map<string, ActiveRun>();
let loop: Promise<void> | undefined;
let initialized: Promise<void> | undefined;

/** Jobs a stopped worker left behind, set to what they were becoming; then runs what can run. */
async function reconcile(): Promise<void> {
  for (const job of await listJobs(Number.MAX_SAFE_INTEGER)) {
    if (job.ownerSession === SESSION || !job.ownerSession) continue;
    const orphan = (patch: Partial<JobRecord>) => ({ ...patch, ownerSession: undefined });
    const ran = (stored: JobRecord) =>
      stored.runningSince
        ? stored.activeMs + Math.max(0, Date.now() - stored.runningSince)
        : stored.activeMs;
    if (job.state === 'running') {
      // Checking links only reads, so it starts again from its saved items.
      await transitionJob(job.id, ['running'], 'queued', (stored) =>
        orphan({ activeMs: ran(stored), runningSince: undefined }),
      );
    } else if (job.state === 'pause_requested') {
      await transitionJob(job.id, ['pause_requested'], 'paused', (stored) =>
        orphan({ activeMs: ran(stored), runningSince: undefined }),
      );
    } else if (job.state === 'cancel_requested') {
      await transitionJob(job.id, ['cancel_requested'], 'cancelled', (stored) =>
        orphan({ activeMs: ran(stored), runningSince: undefined, finishedAt: Date.now() }),
      );
    }
  }
}

/** Once per background run: reconcile, prune, and run what can run. Commands wait for it. */
function initialize(): Promise<void> {
  initialized ??= reconcile()
    .then(() => pruneJobs())
    .then(() => {
      kick();
    })
    .catch((error: unknown) => {
      initialized = undefined;
      console.error('[Jobs] Could not start:', error);
    });
  return initialized;
}

/** Keeps the watchdog alarm while a job can run, and removes it when none can. */
async function reschedule(): Promise<void> {
  const runnable = (await listJobs(Number.MAX_SAFE_INTEGER)).some(
    (job) => job.state === 'queued' || job.state === 'running',
  );
  if (!browser.alarms) return;
  if (runnable) {
    const existing = await browser.alarms.get(JOB_ALARM);
    if (!existing) {
      await browser.alarms.create(JOB_ALARM, { periodInMinutes: JOB_LIMITS.watchdogMinutes });
    }
  } else {
    await browser.alarms.clear(JOB_ALARM);
  }
}

/** Starts the run loop unless it is running. */
function kick(): void {
  loop ??= runLoop()
    .catch((error: unknown) => console.error('[Jobs] Run failed:', error))
    .finally(() => {
      loop = undefined;
      void reschedule();
    });
}

/** The oldest job that can run: one this background holds, or a waiting one. */
async function nextRunnable(): Promise<JobRecord | undefined> {
  const jobs = await listJobs(Number.MAX_SAFE_INTEGER);
  return jobs
    .filter(
      (job) => job.state === 'queued' || (job.state === 'running' && job.ownerSession === SESSION),
    )
    .sort((a, b) => a.createdAt - b.createdAt)[0];
}

async function runLoop(): Promise<void> {
  await reschedule();
  for (let job = await nextRunnable(); job; job = await nextRunnable()) {
    await runSlice(job);
  }
}

/** One slice of a job: up to the slice's items or time, then saved and released or finished. */
async function runSlice(waiting: JobRecord): Promise<void> {
  const job = await claimJob(waiting.id, SESSION);
  if (!job) return;
  const adapter = ADAPTERS[job.kind];
  const run: ActiveRun = { generation: job.generation, controllers: new Set() };
  active.set(job.id, run);
  const started = Date.now();
  try {
    const queue = await getPendingItems(job.id, JOB_LIMITS.sliceMaxItems);
    const overTime = () => Date.now() - started > JOB_LIMITS.sliceMaxMs;
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        if (run.stop || overTime()) return;
        await runItem(job, run, adapter, item);
      }
    };
    const workers = Math.max(1, Math.min(adapter.concurrency(job.options), queue.length));
    await Promise.all(Array.from({ length: workers }, worker));
  } finally {
    active.delete(job.id);
  }
  await settleSlice(job.id, run);
}

async function runItem(job: JobRecord, run: ActiveRun, adapter: JobAdapter, item: JobItem) {
  const controller = new AbortController();
  run.controllers.add(controller);
  try {
    const { outcome, result } = await adapter.run(item.input, job.options, controller.signal);
    await commitItem(job.id, run.generation, item.index, outcome, result);
  } catch (error) {
    // Stopped by pause or cancel: left to do, never a finding.
    if (error instanceof RequestAbortedError || controller.signal.aborted) return;
    await commitItem(job.id, run.generation, item.index, 'failed', {
      error: error instanceof Error ? error.name : 'Error',
    });
  } finally {
    run.controllers.delete(controller);
  }
}

/** After a slice: paused, cancelled, finished, or left running for the next slice. */
async function settleSlice(jobId: string, run: ActiveRun): Promise<void> {
  const ended = (job: JobRecord) => ({
    activeMs: job.activeMs + (job.runningSince ? Math.max(0, Date.now() - job.runningSince) : 0),
    runningSince: undefined,
    ownerSession: undefined,
  });
  if (run.stop === 'pause') {
    await transitionJob(jobId, ['pause_requested'], 'paused', ended);
    return;
  }
  if (run.stop === 'cancel') {
    await transitionJob(jobId, ['cancel_requested'], 'cancelled', (job) => ({
      ...ended(job),
      finishedAt: Date.now(),
    }));
    return;
  }
  const [next] = await getPendingItems(jobId, 1);
  const job = await getJob(jobId);
  if (next || !job) return;
  // Every item has a result; some could not be checked at all.
  await transitionJob(
    jobId,
    ['running'],
    job.done.failed > 0 ? 'partial' : 'succeeded',
    (stored) => ({
      ...ended(stored),
      finishedAt: Date.now(),
    }),
  );
}

/** Stops a running job's work in flight; the slice then settles it. */
function stopActive(jobId: string, stop: 'pause' | 'cancel'): boolean {
  const run = active.get(jobId);
  if (!run) return false;
  run.stop = stop;
  for (const controller of run.controllers) controller.abort();
  return true;
}

async function start(command: JobCommand & { type: 'start' }): Promise<JobRecord> {
  const { inputs, options, label } = await ADAPTERS[command.kind].prepare(command);
  const { job } = await acceptJob({
    commandId: command.commandId,
    kind: command.kind,
    source: command.source,
    scope: {
      mode: command.scope.mode,
      rootIds: command.scope.mode === 'folder' ? [command.scope.folderId] : [],
      label,
    },
    options,
    inputs,
    now: Date.now(),
  });
  // The alarm before the answer, so a worker stopped right after still comes back for it.
  await reschedule();
  kick();
  return job;
}

async function pause(jobId: string): Promise<JobRecord | undefined> {
  const queued = await transitionJob(jobId, ['queued'], 'paused');
  if (queued) return queued;
  const requested = await transitionJob(jobId, ['running'], 'pause_requested');
  if (requested && !stopActive(jobId, 'pause')) {
    // No run of this background holds it: nothing can land, so it is paused now.
    return transitionJob(jobId, ['pause_requested'], 'paused', () => ({
      ownerSession: undefined,
      runningSince: undefined,
    }));
  }
  return requested ?? getJob(jobId);
}

async function resume(jobId: string): Promise<JobRecord | undefined> {
  const resumed = await transitionJob(jobId, ['paused'], 'queued');
  if (resumed) {
    await reschedule();
    kick();
  }
  return resumed ?? getJob(jobId);
}

async function cancel(jobId: string): Promise<JobRecord | undefined> {
  const waiting = await transitionJob(jobId, ['queued', 'paused'], 'cancelled', () => ({
    finishedAt: Date.now(),
  }));
  if (waiting) return waiting;
  const requested = await transitionJob(jobId, ['running', 'pause_requested'], 'cancel_requested');
  if (requested && !stopActive(jobId, 'cancel')) {
    return transitionJob(jobId, ['cancel_requested'], 'cancelled', () => ({
      ownerSession: undefined,
      runningSince: undefined,
      finishedAt: Date.now(),
    }));
  }
  return requested ?? getJob(jobId);
}

/** Carries out a validated command; exported for tests. */
export async function runJobCommand(command: JobCommand): Promise<JobCommandResponse> {
  await initialize();
  try {
    if (command.type === 'start') return { ok: true, job: await start(command) };
    if (command.type === 'delete') {
      await deleteJob(command.jobId);
      return { ok: true, job: null };
    }
    const handle = { pause, resume, cancel }[command.type];
    const job = await handle(command.jobId);
    return job ? { ok: true, job } : { ok: false, error: 'not-found' };
  } catch (error) {
    console.error('[Jobs] Command failed:', error instanceof Error ? error.name : error);
    return { ok: false, error: 'store' };
  }
}

/** Waits until this background has nothing running; for tests. */
export async function whenJobsIdle(): Promise<void> {
  while (loop) await loop;
}

/**
 * Registers the job listeners. Call synchronously from the background's main function, so a
 * command or the alarm can wake a stopped worker; the rest starts asynchronously.
 */
export function registerJobs(): void {
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if ((message as { type?: unknown } | null)?.type !== JOB_COMMAND_MESSAGE) return undefined;
    if (!isExtensionPageSender(sender)) {
      sendResponse({ ok: false, error: 'forbidden' } satisfies JobCommandResponse);
      return undefined;
    }
    const parsed = jobCommandSchema.safeParse((message as { command?: unknown }).command);
    if (!parsed.success) {
      sendResponse({ ok: false, error: 'invalid' } satisfies JobCommandResponse);
      return undefined;
    }
    void runJobCommand(parsed.data).then(sendResponse);
    return true;
  });
  browser.alarms?.onAlarm.addListener((alarm) => {
    if (alarm.name === JOB_ALARM) void initialize().then(kick);
  });
  browser.runtime.onStartup.addListener(() => void initialize());
  void initialize();
}

/** For tests: forget this background's run state, as a new worker would. */
export function resetJobCoordinatorForTests(): void {
  initialized = undefined;
  loop = undefined;
  active.clear();
}
