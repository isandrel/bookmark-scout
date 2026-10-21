/**
 * How a background job reads in the UI: its title, state, and progress, from what is stored, never
 * estimated. No React here.
 */

/** The tool title each kind of job shows. */
const JOB_TITLE_KEYS: Record<JobKind, MessageKey> = {
  deadLinks: 'tools_checkDeadLinks',
  metadataFetcher: 'tools_metadataFetcher',
  siteIcons: 'tools_siteIcons',
};

export function jobTitle(job: Pick<JobRecord, 'kind'>): string {
  return t(JOB_TITLE_KEYS[job.kind]);
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

/** Where the job runs: all bookmarks, or the folder it was started on. */
export function jobScopeLabel(job: Pick<JobRecord, 'scope'>): string {
  return job.scope.mode === 'all' ? t('settings_scopeAll') : job.scope.label;
}

/** "40 of 120"; the total is known from the start, so the share is never made up. */
export function jobProgressLabel(job: Pick<JobRecord, 'done' | 'total'>): string {
  return t('jobs_progress', [formatCount(processedCount(job)), formatCount(job.total)]);
}

/** The commands that make sense in a state, in the order the UI shows them. */
export function jobActions(state: JobState): ('pause' | 'resume' | 'cancel' | 'delete')[] {
  if (state === 'queued' || state === 'running') return ['pause', 'cancel'];
  if (state === 'paused') return ['resume', 'cancel'];
  if (state === 'pause_requested') return ['cancel'];
  if (FINISHED_JOB_STATES.has(state)) return ['delete'];
  return [];
}

/** Whether a job is still going (its progress can change). */
export function isJobActive(job: Pick<JobRecord, 'state'>): boolean {
  return ACTIVE_JOB_STATES.has(job.state);
}
