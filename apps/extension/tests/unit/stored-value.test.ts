import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { defineStoredValue } from '@/lib/stored-value';
import { STORAGE_KEYS } from '@/lib/storage-keys';

type Counter = { count: number; items: string[] };

const KEY = 'test-counter';
const EMPTY: Counter = { count: 0, items: [] };

function parseCounter(raw: unknown): Counter {
  if (!raw || typeof raw !== 'object') return { count: 0, items: [] };
  const value = raw as Partial<Counter>;
  return {
    count: typeof value.count === 'number' ? value.count : 0,
    items: Array.isArray(value.items) ? value.items.filter((item) => typeof item === 'string') : [],
  };
}

const counter = defineStoredValue<Counter>({
  key: `local:${KEY}`,
  parse: parseCounter,
  empty: EMPTY,
  isEmpty: (value) => value.count === 0 && value.items.length === 0,
});

async function stored(): Promise<unknown> {
  return (await fakeBrowser.storage.local.get(KEY))[KEY];
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/**
 * A slow storage read: the next `get` returns what storage holds now, but only once `release` is
 * called, which then waits for that result to be handled.
 */
async function holdNextRead() {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const before = await fakeBrowser.storage.local.get();
  vi.spyOn(fakeBrowser.storage.local, 'get').mockImplementationOnce(async (keys) => {
    await gate;
    const names = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : [];
    return Object.fromEntries(
      names.filter((name) => name in before).map((name) => [name, before[name]]),
    );
  });
  return {
    release: async () => {
      open();
      await settle();
    },
  };
}

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('defineStoredValue', () => {
  it('parses what storage holds and returns the empty value for nothing', async () => {
    expect(await counter.get()).toEqual(EMPTY);
    await fakeBrowser.storage.local.set({ [KEY]: { count: 2, items: ['a', 7], extra: true } });
    expect(await counter.get()).toEqual({ count: 2, items: ['a'] });
  });

  it('stores the parsed value under its key and area, and removes an empty value', async () => {
    await counter.set({ count: 1, items: ['x'] });
    expect(await stored()).toEqual({ count: 1, items: ['x'] });
    expect(await fakeBrowser.storage.sync.get()).toEqual({});

    await counter.set(EMPTY);
    expect(await fakeBrowser.storage.local.get()).toEqual({});

    await counter.set({ count: 3, items: [] });
    await counter.clear();
    expect(await fakeBrowser.storage.local.get()).toEqual({});
  });

  it('runs concurrent updates one at a time, each on the latest value', async () => {
    await Promise.all(
      ['a', 'b', 'c'].map((item) =>
        counter.update((current) => ({
          count: current.count + 1,
          items: [...current.items, item],
        })),
      ),
    );
    expect(await stored()).toEqual({ count: 3, items: ['a', 'b', 'c'] });
  });

  it('writes nothing when an update throws or changes nothing', async () => {
    await counter.set({ count: 1, items: [] });
    const setSpy = vi.spyOn(fakeBrowser.storage.local, 'set');

    await expect(
      counter.update(() => {
        throw new Error('invalid');
      }),
    ).rejects.toThrow('invalid');
    expect(await counter.update((current) => ({ ...current }))).toEqual({ count: 1, items: [] });
    expect(setSpy).not.toHaveBeenCalled();

    // A failed update does not block later ones.
    await counter.update((current) => ({ ...current, count: 2 }));
    expect(await stored()).toEqual({ count: 2, items: [] });
  });

  it('watches parsed changes from any page', async () => {
    const seen: Counter[] = [];
    const unwatch = counter.watch((value) => seen.push(value));
    await fakeBrowser.storage.local.set({ [KEY]: { count: 5 } });
    await fakeBrowser.storage.local.remove(KEY);
    unwatch();
    expect(seen).toEqual([{ count: 5, items: [] }, EMPTY]);
  });
});

describe('observe', () => {
  it('delivers the loaded value, then each change, then stops', async () => {
    await counter.set({ count: 1, items: [] });
    const seen: number[] = [];
    const stop = counter.observe((value) => seen.push(value.count));
    await vi.waitFor(() => expect(seen).toEqual([1]));

    await counter.update((current) => ({ ...current, count: 2 }));
    await fakeBrowser.storage.local.set({ [KEY]: { count: 3 } });
    await vi.waitFor(() => expect(seen).toEqual([1, 2, 3]));

    stop();
    await fakeBrowser.storage.local.set({ [KEY]: { count: 4 } });
    expect(seen).toEqual([1, 2, 3]);
  });

  it('keeps a change from storage over an initial read that resolves later', async () => {
    await fakeBrowser.storage.local.set({ [KEY]: { count: 1 } });
    const { release } = await holdNextRead();
    const seen: number[] = [];
    const stop = counter.observe((value) => seen.push(value.count));

    await fakeBrowser.storage.local.set({ [KEY]: { count: 2 } });
    await vi.waitFor(() => expect(seen).toEqual([2]));
    await release();

    expect(seen).toEqual([2]);
    stop();
  });

  it('keeps this page’s own write over an initial read that resolves later', async () => {
    await fakeBrowser.storage.local.set({ [KEY]: { count: 1 } });
    const { release } = await holdNextRead();
    const seen: number[] = [];
    const stop = counter.observe((value) => seen.push(value.count));

    await counter.set({ count: 9, items: [] });
    await release();

    expect(seen.at(-1)).toBe(9);
    stop();
  });

  it('reports the empty value as loaded when storage cannot be read', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValueOnce(new Error('unavailable'));
    const seen: Counter[] = [];
    const stop = counter.observe((value) => seen.push(value));
    await vi.waitFor(() => expect(seen).toEqual([EMPTY]));
    stop();
  });

  it('shares one storage read and one watcher among every observer on the page', async () => {
    await counter.set({ count: 1, items: [] });
    const reads = vi.spyOn(fakeBrowser.storage.local, 'get');
    const watchers = vi.spyOn(fakeBrowser.storage.onChanged, 'addListener');
    const seen: number[][] = [[], [], []];
    const stops = seen.map((list) => counter.observe((value) => list.push(value.count)));
    await vi.waitFor(() => expect(seen).toEqual([[1], [1], [1]]));

    expect(reads).toHaveBeenCalledTimes(1);
    expect(watchers.mock.calls.length).toBeLessThanOrEqual(1);
    for (const stop of stops) stop();
  });
});

describe('site icon store', () => {
  it('keeps icons saved while the first read is still loading', async () => {
    vi.resetModules();
    const icon = 'data:image/png;base64,AAAA';
    const { ensureSiteIconsLoaded, useSiteIconStore } = await import('@/stores/site-icon-store');
    // Storage items read once when defined; let that finish so the hold catches the store's read.
    await settle();
    const { release } = await holdNextRead();

    ensureSiteIconsLoaded();
    await fakeBrowser.storage.local.set({
      [STORAGE_KEYS.siteIcons.replace(/^local:/, '')]: {
        'https://example.com': { icon, fetchedAt: 1 },
      },
    });
    // The storage event lands first; the slow first read must not undo it.
    await vi.waitFor(() => expect(useSiteIconStore.getState().count).toBe(1));
    await release();

    expect(useSiteIconStore.getState()).toMatchObject({ loaded: true, count: 1 });
    expect(useSiteIconStore.getState().byOrigin['https://example.com']).toBe(icon);
  });
});
