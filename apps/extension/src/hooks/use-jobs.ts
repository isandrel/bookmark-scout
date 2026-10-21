/**
 * Background jobs for React: read from the job store (`lib/job-store.ts`) and read again when any
 * context changes one (`JOB_CHANNEL`) or the page comes back into view, so a reopened popup or
 * manager shows the same job and its progress without starting anything.
 */
import { useCallback, useEffect, useState } from 'react';

/** Calls `refresh` now, on every job change, and when the page is shown again. */
function useJobChanges(refresh: () => void): void {
  useEffect(() => {
    refresh();
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(JOB_CHANNEL);
      channel.onmessage = () => refresh();
    } catch {
      // No BroadcastChannel: the page refreshes when shown again.
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      channel?.close();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);
}

/** The newest jobs, newest first; undefined while loading. */
export function useJobs(): JobRecord[] | undefined {
  const [jobs, setJobs] = useState<JobRecord[]>();
  const refresh = useCallback(() => {
    void listJobs()
      .then(setJobs)
      .catch(() => setJobs([]));
  }, []);
  useJobChanges(refresh);
  return jobs;
}

/** The newest job of `kind`, if any. */
export function useLatestJob(kind: JobKind): JobRecord | undefined {
  return useJobs()?.find((job) => job.kind === kind);
}
