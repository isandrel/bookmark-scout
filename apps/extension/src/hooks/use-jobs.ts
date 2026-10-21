/**
 * Background jobs for React: read from the job store (`lib/job-store.ts`) and read again when any
 * context changes one (`JOB_CHANNEL`) or the page comes back into view, so a reopened popup or
 * manager shows the same job and its progress without starting anything.
 *
 * A page has one reading of the store, shared by every component that shows jobs. A running job
 * changes many times a second, so changes are gathered and read at most every `refresh_ms`
 * (`config/ui/jobs.toml`).
 */
import { useSyncExternalStore } from 'react';
import { z } from 'zod';

const jobsUi = readConfig('ui/jobs', z.strictObject({ refresh_ms: z.number().int().positive() }));

let jobs: JobRecord[] | undefined;
const listeners = new Set<() => void>();
let channel: BroadcastChannel | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

function read(): void {
  timer = undefined;
  void listJobs()
    .catch((): JobRecord[] => [])
    .then((next) => {
      jobs = next;
      for (const listener of listeners) listener();
    });
}

/** Reads soon, once for any number of changes in the meantime. */
function readSoon(): void {
  timer ??= setTimeout(read, jobsUi.refresh_ms);
}

function onVisible(): void {
  if (document.visibilityState === 'visible') read();
}

/**
 * Calls `listener` whenever the page's reading of the store changes; returns the unsubscribe. The
 * first listener opens the page's one channel and the last one closes it.
 */
export function watchJobs(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    read();
    try {
      channel = new BroadcastChannel(JOB_CHANNEL);
      channel.onmessage = readSoon;
    } catch {
      // No BroadcastChannel: the page reads again when shown.
    }
    document.addEventListener('visibilitychange', onVisible);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    channel?.close();
    channel = undefined;
    clearTimeout(timer);
    timer = undefined;
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** The page's latest reading: the newest jobs, newest first; undefined before the first. */
export function currentJobs(): JobRecord[] | undefined {
  return jobs;
}

/** The newest jobs, newest first; undefined while loading. */
export function useJobs(): JobRecord[] | undefined {
  return useSyncExternalStore(watchJobs, currentJobs);
}

/** The newest job of `kind`, if any. */
export function useLatestJob(kind: JobKind): JobRecord | undefined {
  return useJobs()?.find((job) => job.kind === kind);
}
