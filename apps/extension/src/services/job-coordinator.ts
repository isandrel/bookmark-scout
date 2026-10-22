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

/** This background run; a job claimed by another one was left behind by a stopped worker. */
const SESSION = crypto.randomUUID();
const JOB_ALARM = 'bookmark-scout:jobs';

/**
 * Runs `work` with what a slice of `adapter`'s items needs, open for the slice. An AI kind gets
 * the AI host page with the feature's current service, only while AI is on, set up, and still
 * the service the job started with. For HTML, Firefox's background page parses it itself; a
 * service worker has no DOM parser, so it asks the AI host page. A page's readable text is always
 * read there, so the text reader is never part of the background. Throws `JobBlockedError` when
 * the user has to act first.
 */
async function withJobTools(
  job: JobRecord,
  adapter: JobAdapter,
  work: (tools: JobTools) => Promise<void>,
) {
  const settings = await getSettings();
  const locale = resolveAppLocale(settings.language);
  if (adapter.ai) {
    if (!settings.aiEnabled) throw new JobBlockedError('ai-off');
    const service = await getActiveAISettings(true, adapter.ai.feature).catch((error: unknown) => {
      throw new JobBlockedError('ai-not-set-up', getErrorMessage(error));
    });
    if ((await aiDestination(service)) !== adapter.ai.destination(job.options)) {
      throw new JobBlockedError('ai-service-changed');
    }
    return withAIHost(service, { locale, source: adapter.ai.source }, (host) =>
      work({ ...hostReaders(host), ai: host }),
    );
  }
  if (!adapter.readsText && (!adapter.readsHtml || typeof DOMParser === 'function')) {
    return work({ readHead: async (html, descriptions) => readHtmlHead(html, descriptions) });
  }
  return withAIHost(null, { locale }, (host) => work(hostReaders(host)));
}

/**
 * The host page's readers, whose failure (the page closed or gone) pauses the job instead of
 * counting the page being read as unreadable.
 */
function hostReaders(host: AIHostSession): Pick<JobTools, 'readHead' | 'readText'> {
  const blocked = (error: unknown): never => {
    throw new JobBlockedError('slice-setup', error instanceof Error ? error.name : 'Error');
  };
  return {
    readHead: (html, descriptions) =>
      Promise.resolve(host.readHead(html, descriptions)).catch(blocked),
    readText: (html, maxChars) => Promise.resolve(host.readText(html, maxChars)).catch(blocked),
  };
}

/** The job running in this background, with what stops its work in flight. */
type ActiveRun = {
  generation: number;
  controllers: Set<AbortController>;
  /**
   * `block`: the job pauses until the user acts (`blocked` says why), also when the slice could
   * not run at all (`slice-setup`, with the error's name).
   */
  stop?: 'pause' | 'cancel' | 'block';
  blocked?: { code: JobBlockCode; detail?: string };
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
    // Work the stopped worker started may have happened (an AI request answered and paid for,
    // a bookmark written) with nothing saved: the job waits for the user instead of doing it
    // again on its own.
    const unsure = JOB_ADAPTERS[job.kind].unsureAfterStop;
    const uncertain = unsure !== undefined && (await getInFlightItems(job.id)).length > 0;
    const uncertainError = uncertain && unsure ? { lastError: { code: unsure, message: '' } } : {};
    if (job.state === 'running') {
      // Reading work starts again from its saved items.
      await transitionJob(job.id, ['running'], uncertain ? 'paused' : 'queued', (stored) =>
        orphan({ activeMs: ran(stored), runningSince: undefined, ...uncertainError }),
      );
    } else if (job.state === 'pause_requested') {
      await transitionJob(job.id, ['pause_requested'], 'paused', (stored) =>
        orphan({ activeMs: ran(stored), runningSince: undefined, ...uncertainError }),
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

/** When each job last had a slice in this background; a job not yet run has none. */
const lastSliceAt = new Map<string, number>();

/**
 * The job to give the next slice: one this background holds, or a waiting one. Jobs take turns
 * by slice, the one that waited longest first (a new job before any that has run, then the
 * oldest), so a short job started during a long one is not held until the long one ends.
 */
async function nextRunnable(): Promise<JobRecord | undefined> {
  const jobs = await listJobs(Number.MAX_SAFE_INTEGER);
  const runnable = jobs.filter(
    (job) => job.state === 'queued' || (job.state === 'running' && job.ownerSession === SESSION),
  );
  // A job that can no longer run needs no turn; one resumed later starts as if new.
  const ids = new Set(runnable.map((job) => job.id));
  for (const id of lastSliceAt.keys()) if (!ids.has(id)) lastSliceAt.delete(id);
  const turn = (job: JobRecord) => lastSliceAt.get(job.id) ?? Number.NEGATIVE_INFINITY;
  return runnable.sort((a, b) => turn(a) - turn(b) || a.createdAt - b.createdAt)[0];
}

async function runLoop(): Promise<void> {
  await reschedule();
  for (let job = await nextRunnable(); job; job = await nextRunnable()) {
    await runSlice(job);
  }
}

/** One slice of a job: up to the slice's items or time, then saved and released or finished. */
/**
 * Saves a slice's results: in batches (`commit_batch_items`, `commit_batch_ms`) for reading
 * work, which a stopped worker only has to check again; one at a time for work that cannot be
 * taken back (`unsureAfterStop`), whose in-flight mark each save clears.
 */
function commitBuffer(job: JobRecord, run: ActiveRun, batched: boolean) {
  const waiting: ItemCommit[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving: Promise<unknown> = Promise.resolve();
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (waiting.length > 0) {
      const batch = waiting.splice(0);
      saving = saving.then(() => commitItems(job.id, run.generation, batch));
    }
    return saving;
  };
  return {
    flush,
    save(commit: ItemCommit) {
      waiting.push(commit);
      if (!batched || waiting.length >= JOB_LIMITS.commitBatchItems) return flush();
      // A result is never kept back longer than the batch time, even while the next item waits
      // on a slow site.
      timer ??= setTimeout(() => void flush(), JOB_LIMITS.commitBatchMs);
      return saving;
    },
  };
}

async function runSlice(waiting: JobRecord): Promise<void> {
  lastSliceAt.set(waiting.id, Date.now());
  const job = await claimJob(waiting.id, SESSION);
  if (!job) return;
  const adapter = JOB_ADAPTERS[job.kind];
  const run: ActiveRun = { generation: job.generation, controllers: new Set() };
  active.set(job.id, run);
  const started = Date.now();
  try {
    const queue = await getPendingItems(job.id, JOB_LIMITS.sliceMaxItems);
    if ('runBatch' in adapter) {
      await runBatchSlice(job, run, adapter, queue);
    } else {
      const overTime = () => Date.now() - started > JOB_LIMITS.sliceMaxMs;
      const workers = Math.max(1, Math.min(adapter.concurrency(job.options), queue.length));
      const results = commitBuffer(job, run, !adapter.unsureAfterStop);
      try {
        await withJobTools(job, adapter, async (tools) => {
          const worker = async () => {
            for (let item = queue.shift(); item; item = queue.shift()) {
              if (run.stop || overTime()) return;
              await runItem(job, run, adapter, item, tools, results.save);
            }
          };
          await Promise.all(Array.from({ length: workers }, worker));
        });
      } finally {
        // Whatever finished is saved before the slice settles, also when it stopped early.
        await results.flush();
      }
    }
  } catch (error) {
    if (error instanceof JobBlockedError) {
      run.stop ??= 'block';
      run.blocked ??= { code: error.code, detail: error.detail };
    } else {
      // What the slice needed could not be set up or saved (the AI host page gone, a save
      // refused): the job pauses with what it has, and Resume tries again from there.
      console.error('[Jobs] Slice could not run:', error instanceof Error ? error.name : error);
      run.stop ??= 'block';
      run.blocked ??= {
        code: 'slice-setup',
        detail: error instanceof Error ? error.name : 'Error',
      };
    }
  } finally {
    active.delete(job.id);
  }
  await settleSlice(job.id, run);
}

/**
 * One slice of a kind that does a slice as one step (`runBatch`): its items are marked in flight
 * first, so a worker stopped halfway leaves the job for the user, then every outcome is saved.
 */
async function runBatchSlice(
  job: JobRecord,
  run: ActiveRun,
  adapter: Extract<JobAdapter, { runBatch: unknown }>,
  items: JobItem[],
) {
  const [first] = items;
  if (!first || run.stop) return;
  const indexes = items.map((item) => item.index);
  if (!(await markItemsInFlight(job.id, run.generation, indexes, Date.now()))) return;
  const part = {
    jobId: job.id,
    index: Math.floor(first.index / JOB_LIMITS.sliceMaxItems) + 1,
    of: Math.ceil(job.total / JOB_LIMITS.sliceMaxItems),
  };
  let runs: JobRun[];
  try {
    runs = await adapter.runBatch(
      items.map((item) => item.input),
      job.options,
      part,
    );
  } catch (error) {
    // It refused before writing (a record of what goes could not be kept): nothing is in flight.
    await markItemsInFlight(job.id, run.generation, indexes, undefined);
    throw error;
  }
  await commitItems(
    job.id,
    run.generation,
    items.map((item, position) => ({ index: item.index, ...runs[position] })),
  );
}

/** Whether website access still covers `urls` (a site, or all websites past the site limit). */
async function hasItemSiteAccess(urls: string[]): Promise<boolean> {
  const sites = getUrlSites(urls);
  if (sites.length === 0) return true;
  const origins = getSiteAccessOrigins(sites);
  return origins ? hasSiteAccess('webAccess', origins) : hasPermission('webAccess');
}

async function runItem(
  job: JobRecord,
  run: ActiveRun,
  adapter: Extract<JobAdapter, { run: unknown }>,
  item: JobItem,
  tools: JobTools,
  save: (commit: ItemCommit) => Promise<unknown>,
) {
  // Work that cannot be taken back is marked before it starts, so a stopped worker shows it.
  if (
    adapter.unsureAfterStop &&
    !(await markItemInFlight(job.id, run.generation, item.index, Date.now()))
  ) {
    return;
  }
  const controller = new AbortController();
  run.controllers.add(controller);
  try {
    if (adapter.siteUrls && !(await hasItemSiteAccess(adapter.siteUrls(item.input)))) {
      throw new JobBlockedError('site-access');
    }
    const { outcome, result } = await adapter.run(
      item.input,
      job.options,
      controller.signal,
      tools,
    );
    await save({ index: item.index, outcome, result });
  } catch (error) {
    if (error instanceof JobBlockedError) {
      // The request was answered, with an error: nothing is in flight, and the item stays to do.
      if (adapter.unsureAfterStop) {
        await markItemInFlight(job.id, run.generation, item.index, undefined);
      }
      run.stop ??= 'block';
      run.blocked ??= { code: error.code, detail: error.detail };
      return;
    }
    // Stopped by pause or cancel: left to do, never a finding.
    if (error instanceof RequestAbortedError || controller.signal.aborted) return;
    await save({
      index: item.index,
      outcome: 'failed',
      result: { error: error instanceof Error ? error.name : 'Error' },
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
  if (run.stop === 'block') {
    const { code, detail } = run.blocked ?? { code: 'slice-setup' };
    await transitionJob(jobId, ['running', 'pause_requested'], 'paused', (job) => ({
      ...ended(job),
      lastError: { code, message: detail ?? '' },
    }));
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
  const { prepare } = JOB_ADAPTERS[command.kind];
  if (!prepare) throw new Error('This kind of job is not started on a scope');
  const { inputs, options, label, summary } = await prepare(command);
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
    ...(summary ? { summary } : {}),
    inputs,
    now: Date.now(),
  });
  // The alarm before the answer, so a worker stopped right after still comes back for it.
  await reschedule();
  kick();
  return job;
}

/** Accepts reviewed changes the user approved, to apply in parts (`applyChanges`). */
async function apply(command: JobCommand & { type: 'apply' }): Promise<JobRecord> {
  const { job } = await acceptJob({
    commandId: command.commandId,
    kind: 'applyChanges',
    source: command.source,
    scope: { mode: 'all', rootIds: [], label: '' },
    options: { tool: command.tool, ...(command.requireRecord ? { requireRecord: true } : {}) },
    inputs: command.changes,
    now: Date.now(),
  });
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
  // Resuming is the user's answer to whatever stopped the job, an unanswered request included.
  const resumed = await transitionJob(jobId, ['paused'], 'queued', () => ({
    lastError: undefined,
  }));
  if (resumed) {
    await clearInFlightItems(jobId);
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
    if (command.type === 'apply') return { ok: true, job: await apply(command) };
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
  lastSliceAt.clear();
}
