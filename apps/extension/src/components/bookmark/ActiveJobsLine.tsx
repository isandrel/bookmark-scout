/**
 * A one-line notice in the popup and side panel while background jobs run, linking to the
 * manager's Background tasks. Nothing shows when none runs.
 */
import { ListChecks } from 'lucide-react';

export function ActiveJobsLine() {
  const jobs = useJobs();
  const running = jobs?.filter(isJobActive) ?? [];
  const [first] = running;
  if (!first) return null;
  const text =
    running.length === 1
      ? t('jobs_popupOne', [jobTitle(first), jobProgressLabel(first)])
      : t('jobs_popupMany', String(running.length));
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 border-b px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
      onClick={() => void openBackgroundTasks()}
      data-testid="active-jobs-line"
    >
      <ListChecks className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 truncate">{text}</span>
    </button>
  );
}
