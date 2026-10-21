/**
 * One background job as the user sees it: what it is, where it runs, its state, its real progress,
 * and the commands that make sense now. Used on the tool card that started it and in the
 * manager's Background tasks dialog.
 */
import { Pause, Play, Square, Trash2 } from 'lucide-react';
import { useState } from 'react';

/** Sends a command; a failure is told in a toast and never changes what the page shows. */
async function sendCommand(command: JobCommand): Promise<void> {
  const response = await sendJobCommand(command).catch(() => undefined);
  if (!response?.ok) toast.error({ title: t('jobs_commandFailed') });
}

const ACTION_ICONS = { pause: Pause, resume: Play, cancel: Square, delete: Trash2 } as const;
const ACTION_LABELS: Record<keyof typeof ACTION_ICONS, MessageKey> = {
  pause: 'jobs_pause',
  resume: 'jobs_resume',
  cancel: 'action_cancel',
  delete: 'action_delete',
};

export function JobStatus({
  job,
  onReview,
  showTitle = true,
}: {
  job: JobRecord;
  /** Opens the results; shown once there are any. */
  onReview?: () => void;
  showTitle?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const processed = processedCount(job);
  const active = isJobActive(job);
  const errorMessage = jobErrorMessage(job);
  const run = (action: keyof typeof ACTION_ICONS) => {
    setBusy(true);
    void sendCommand({ type: action, jobId: job.id }).finally(() => setBusy(false));
  };

  return (
    <div className="space-y-1.5" data-testid="job-status" data-job-state={job.state}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="min-w-0 truncate font-medium">
          {showTitle ? `${jobTitle(job)} · ` : ''}
          {jobScopeLabel(job)}
        </span>
        {/* Announced when the state changes, never per item. */}
        <span className="shrink-0 text-muted-foreground" aria-live="polite">
          {jobStateLabel(job.state)}
        </span>
      </div>
      {job.total > 0 ? (
        <ProgressBar value={processed} max={job.total} label={jobTitle(job)} />
      ) : null}
      <p className="text-xs text-muted-foreground" data-testid="job-progress">
        {jobProgressLabel(job)}
        {' · '}
        {jobCountsLabel(job)}
      </p>
      {errorMessage ? (
        <p className="text-xs text-warning" data-testid="job-error">
          {errorMessage}
        </p>
      ) : null}
      {active ? <p className="text-xs text-muted-foreground">{t('jobs_runsNote')}</p> : null}
      {job.state === 'cancelled' ? (
        <p className="text-xs text-muted-foreground">{jobCancelledNote(job)}</p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {onReview && processed > 0 ? (
          <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={onReview}>
            {t('jobs_review')}
          </Button>
        ) : null}
        {jobActions(job.state).map((action) => {
          const Icon = ACTION_ICONS[action];
          return (
            <Button
              key={action}
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={busy}
              onClick={() => run(action)}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(ACTION_LABELS[action])}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

/** Every result of a job, in order, read page by page. */
export async function readJobResults(jobId: string): Promise<unknown[]> {
  const results: unknown[] = [];
  for (let from = 0; ; ) {
    const page = await getJobItems(jobId, { from });
    for (const item of page) if (item.state === 'done') results.push(item.result);
    const last = page.at(-1);
    if (!last || page.length < JOB_LIMITS.pageSize) return results;
    from = last.index + 1;
  }
}
