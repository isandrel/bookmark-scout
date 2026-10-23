/**
 * How a background job reads in the UI: its title, state, and progress, from what is stored, never
 * estimated. No React here.
 */

/**
 * How each kind of job reads, one entry per kind (`JOB_KINDS`): a scan shows its tool's title; a
 * job that applies reviewed changes names the tool whose changes it applies (its title key, fixed
 * or from the job's options) and says what a stopped one kept. Kept here rather than on
 * `JOB_ADAPTERS`, which hold the background's work and must stay out of the pages' startup code.
 */
type ScanJobView = { titleKey: MessageKey };
type ApplyJobView = { appliedTool: (options: unknown) => string; cancelledNoteKey: MessageKey };

const JOB_VIEWS: Record<ScanJobKind, ScanJobView> &
  Record<(typeof APPLY_JOB_KINDS)[number], ApplyJobView> = {
  deadLinks: { titleKey: 'tools_checkDeadLinks' },
  metadataFetcher: { titleKey: 'tools_metadataFetcher' },
  siteIcons: { titleKey: 'tools_siteIcons' },
  pageText: { titleKey: 'tools_pageText' },
  reorganization: { titleKey: 'tools_aiReorganize' },
  applyChanges: {
    appliedTool: (options) => applyJobOptionsSchema.parse(options).tool,
    cancelledNoteKey: 'jobs_cancelledApplyNote',
  },
  // A Smart Rules run's tags are undone from Settings, its moves from the History.
  applyRules: { appliedTool: () => RULE_RUN_TOOL, cancelledNoteKey: 'jobs_cancelledRulesNote' },
};

/** Whether a job applies reviewed changes, rather than scanning. */
function isApplyJob(job: Pick<JobRecord, 'kind'>): boolean {
  return 'appliedTool' in JOB_VIEWS[job.kind];
}

export function jobTitle(job: Pick<JobRecord, 'kind' | 'options'>): string {
  const view = JOB_VIEWS[job.kind];
  return 'appliedTool' in view
    ? t('jobs_applyTitle', t(view.appliedTool(job.options)))
    : t(view.titleKey);
}

/** What one kind of job counts: links checked, or changes applied. */
export function jobCountsLabel(job: Pick<JobRecord, 'kind' | 'done'>): string {
  const counts = [job.done.succeeded, job.done.skipped, job.done.failed].map(formatCount);
  return t(isApplyJob(job) ? 'jobs_countsApply' : 'jobs_counts', counts);
}

/** What a stopped job kept: scan results, or the changes already made. */
export function jobCancelledNote(job: Pick<JobRecord, 'kind'>): string {
  const view = JOB_VIEWS[job.kind];
  const key: MessageKey = 'cancelledNoteKey' in view ? view.cancelledNoteKey : 'jobs_cancelledNote';
  return t(key);
}

const STATE_KEYS: Record<JobState, MessageKey> = {
  queued: 'jobs_stateQueued',
  running: 'jobs_stateRunning',
  pause_requested: 'jobs_statePausing',
  paused: 'jobs_statePaused',
  cancel_requested: 'jobs_stateCancelling',
  cancelled: 'jobs_stateCancelled',
  succeeded: 'jobs_stateSucceeded',
  partial: 'jobs_statePartial',
  failed: 'jobs_stateFailed',
};

export function jobStateLabel(state: JobState): string {
  return t(STATE_KEYS[state]);
}

/** Where the job runs: all bookmarks, the folder it was started on, or how many changes. */
export function jobScopeLabel(job: Pick<JobRecord, 'kind' | 'scope' | 'total'>): string {
  if (isApplyJob(job)) return tPlural('jobs_applyScope', job.total);
  return job.scope.mode === 'all' ? t('settings_scopeAll') : job.scope.label;
}

/** "40 of 120"; the total is known from the start, so the share is never made up. */
export function jobProgressLabel(job: Pick<JobRecord, 'done' | 'total'>): string {
  return t('jobs_progress', [formatCount(processedCount(job)), formatCount(job.total)]);
}

/** Whether `action` is shown but waiting: Pause asked for and not taken effect yet. */
export function isJobActionPending(state: JobState, action: string): boolean {
  return action === 'pause' && state === 'pause_requested';
}

/** The commands that make sense in a state, in the order the UI shows them. */
export function jobActions(state: JobState): ('pause' | 'resume' | 'cancel' | 'delete')[] {
  if (state === 'queued' || state === 'running') return ['pause', 'cancel'];
  if (state === 'paused') return ['resume', 'cancel'];
  // Pause stays while it takes effect, shown as waiting, so focus on it is not lost.
  if (state === 'pause_requested') return ['pause', 'cancel'];
  if (FINISHED_JOB_STATES.has(state)) return ['delete'];
  return [];
}

const JOB_BLOCK_KEYS: Record<JobBlockCode, MessageKey> = {
  'ai-off': 'jobs_blockedAIOff',
  'ai-not-set-up': 'jobs_blockedAISetup',
  'ai-service-changed': 'jobs_blockedServiceChanged',
  'ai-request': 'jobs_blockedAIRequest',
  'uncertain-request': 'jobs_uncertainRequest',
  'uncertain-write': 'jobs_uncertainWrite',
  'site-access': 'jobs_blockedSiteAccess',
  'slice-setup': 'jobs_errorSetup',
  'rules-off': 'jobs_blockedRulesOff',
};

/** What Resume asks the browser for first, where the reason a job paused is a missing permission. */
export const JOB_BLOCK_PERMISSIONS: Partial<Record<JobBlockCode, PermissionFeature>> = {
  'site-access': 'webAccess',
};

/** The permission Resume has to ask for before resuming `job`, if any. */
export function jobResumePermission(
  job: Pick<JobRecord, 'lastError'>,
): PermissionFeature | undefined {
  const code = job.lastError?.code;
  return code && (JOB_BLOCK_CODES as readonly string[]).includes(code)
    ? JOB_BLOCK_PERMISSIONS[code as JobBlockCode]
    : undefined;
}

/** Why a job stopped or waits for the user, in the current language; undefined when it did not. */
export function jobErrorMessage(job: Pick<JobRecord, 'lastError'>): string | undefined {
  const error = job.lastError;
  if (!error) return undefined;
  const key = (JOB_BLOCK_CODES as readonly string[]).includes(error.code)
    ? JOB_BLOCK_KEYS[error.code as JobBlockCode]
    : 'jobs_errorSetup';
  return t(key, error.message);
}

/** Whether a job is still going (its progress can change). */
export function isJobActive(job: Pick<JobRecord, 'state'>): boolean {
  return ACTIVE_JOB_STATES.has(job.state);
}
