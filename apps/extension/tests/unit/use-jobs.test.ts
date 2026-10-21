import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentJobs, watchJobs } from '@/hooks/use-jobs';
import { acceptJob, closeJobDb, transitionJob } from '@/lib/job-store';

/** A page's document and its job channels, counted. */
function fakePage() {
  const visibility = new Set<() => void>();
  const page = { state: 'visible', channels: 0, opened: 0 };
  vi.stubGlobal('document', {
    get visibilityState() {
      return page.state;
    },
    addEventListener: (_type: string, listener: () => void) => visibility.add(listener),
    removeEventListener: (_type: string, listener: () => void) => visibility.delete(listener),
  });
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      onmessage: (() => void) | null = null;
      constructor() {
        page.channels += 1;
        page.opened += 1;
      }
      postMessage() {
        // Changes from other contexts are what the test leaves out.
      }
      close() {
        page.channels -= 1;
      }
    },
  );
  return {
    page,
    visibilityListeners: () => visibility.size,
    show: () => {
      page.state = 'visible';
      for (const listener of visibility) listener();
    },
  };
}

const job = () =>
  acceptJob({
    commandId: crypto.randomUUID(),
    kind: 'deadLinks',
    source: 'manager',
    scope: { mode: 'all', rootIds: [], label: '' },
    options: {},
    inputs: ['x'],
    now: 1,
  });

beforeEach(async () => {
  await closeJobDb();
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('how a page follows background jobs', () => {
  it('keeps one channel however often views mount and unmount, and none once all are gone (J07)', () => {
    const { page, visibilityListeners } = fakePage();
    const stops: (() => void)[] = [];
    for (let round = 0; round < 20; round += 1) {
      // Three views showing jobs mount, and two unmount again, as a page re-renders.
      stops.push(
        watchJobs(() => {}),
        watchJobs(() => {}),
        watchJobs(() => {}),
      );
      stops.splice(-2).forEach((stop) => {
        stop();
      });
      expect(page.channels).toBe(1);
      expect(visibilityListeners()).toBe(1);
    }
    for (const stop of stops.splice(0)) stop();
    expect(page.channels).toBe(0);
    expect(visibilityListeners()).toBe(0);
    expect(page.opened).toBe(1);
  });

  it('reads the stored job again when shown, after missing its changes (J08)', async () => {
    const { show } = fakePage();
    const { job: stored } = await job();
    const seen: number[] = [];
    const stop = watchJobs(() => {
      const revision = currentJobs()?.find((found) => found.id === stored.id)?.revision;
      if (revision !== undefined) seen.push(revision);
    });
    await vi.waitFor(() => expect(seen).toEqual([0]));
    // Changed elsewhere while the page was hidden; the notices never reached it.
    await transitionJob(stored.id, ['queued'], 'paused');
    await transitionJob(stored.id, ['paused'], 'queued');
    show();
    await vi.waitFor(() => expect(seen.at(-1)).toBe(2));
    stop();
  });
});
