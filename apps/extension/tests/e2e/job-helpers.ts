/** Background jobs as the job store keeps them, read from an extension page or the worker. */
import type { Page, Worker } from '@playwright/test';

export type StoredJob = {
  id: string;
  kind: string;
  state: string;
  total: number;
  done: { succeeded: number; skipped: number; failed: number };
  scope: { mode: string; rootIds: string[] };
  /** What the job froze when it was accepted, such as the sites the user chose. */
  options: unknown;
  createdAt: number;
};

/** The jobs as stored, in key order. */
export async function storedJobs(target: Page | Worker): Promise<StoredJob[]> {
  return target.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('bookmark-scout-jobs');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<StoredJob[]>((resolve, reject) => {
        const request = db.transaction('jobs').objectStore('jobs').getAll();
        request.onsuccess = () => resolve(request.result as StoredJob[]);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}

/** The newest job of `kind` as stored; jobs are keyed by random ids, so by when they were made. */
export async function latestJob(target: Page | Worker, kind: string) {
  return (await storedJobs(target))
    .filter((job) => job.kind === kind)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
}
