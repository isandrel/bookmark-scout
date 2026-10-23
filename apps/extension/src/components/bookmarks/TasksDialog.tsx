/**
 * The manager's Background tasks: every job, newest first, with its progress and commands. It
 * reads the job store, so it shows the same jobs whichever page started them.
 */
import { ListChecks } from 'lucide-react';

/** Shown once there is a job, so the header keeps its room until a tool runs in the background. */
export function TasksButton({ onOpen }: { onOpen: () => void }) {
  const jobs = useJobs();
  if (!jobs?.length) return null;
  const running = jobs.filter(isJobActive).length;
  const label = running > 0 ? t('jobs_buttonRunning', String(running)) : t('jobs_title');
  return (
    <Button
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      onClick={onOpen}
      className="relative"
      data-testid="tasks-button"
    >
      <ListChecks className="h-4 w-4" />
      {running > 0 ? (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary"
        />
      ) : null}
    </Button>
  );
}

export function TasksDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const jobs = useJobs();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl" data-testid="tasks-dialog">
        <DialogHeader>
          <DialogTitle>{t('jobs_title')}</DialogTitle>
          <DialogDescription>{t('jobs_description')}</DialogDescription>
        </DialogHeader>
        {jobs && jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('jobs_empty')}</p>
        ) : (
          <ul className="max-h-dialog-list divide-y overflow-y-auto rounded-md border">
            {(jobs ?? []).map((job) => (
              <li key={job.id} className="p-3">
                <JobStatus job={job} />
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
