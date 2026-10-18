import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { z } from 'zod';
import type { StorageItem } from '@/lib/storage/registry';
import {
  defineStoredValue,
  getStoredValueStore,
  NewerStoredValueError,
  preloadStoredValue,
} from '@/lib/storage/stored-value';
import { setLanguage } from '@/hooks/use-i18n';
import { readStoredRaw, STORAGE_ITEMS, seedStored } from './storage-helpers';

type Counter = { count: number; items: string[] };

/** A test item at version 2, so version 1 data takes one migration step. */
const ITEM: StorageItem = { area: 'local', name: 'test.counter', v: 2, backup: 'exclude' };
const KEY = 'test.counter';
const EMPTY: Counter = { count: 0, items: [] };

function parseCounter(raw: unknown): Counter {
  if (!raw || typeof raw !== 'object') return { count: 0, items: [] };
  const value = raw as Partial<Counter>;
  return {
    count: typeof value.count === 'number' ? value.count : 0,
    items: Array.isArray(value.items) ? value.items.filter((item) => typeof item === 'string') : [],
  };
}

// Version 1 stored the count as `total`.
const migrations = { 1: (data: unknown) => ({ count: (data as { total: number }).total }) };

function defineCounter() {
  return defineStoredValue<Counter>(ITEM, {
    parse: parseCounter,
    empty: EMPTY,
    isEmpty: (value) => value.count === 0 && value.items.length === 0,
    migrations,
  });
}

const counter = defineCounter();

async function stored(): Promise<unknown> {
  return (await fakeBrowser.storage.local.get(KEY))[KEY];
}

/** Stores `data` the way version `v` of the extension would. */
async function storeRaw(data: unknown, v = ITEM.v) {
  await fakeBrowser.storage.local.set({ [KEY]: { v, data } });
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

/** Every storage read waits a little, so concurrent read-modify-writes overlap. */
function slowReads() {
  const get = fakeBrowser.storage.local.get.bind(fakeBrowser.storage.local);
  vi.spyOn(fakeBrowser.storage.local, 'get').mockImplementation(async (keys) => {
    const result = await get(keys as string);
    await settle();
    return result;
  });
}

beforeEach(() => {
  fakeBrowser.reset();
  setLanguage('en');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('defineStoredValue', () => {
  it('parses the stored data and returns the empty value for nothing', async () => {
    expect(await counter.get()).toEqual(EMPTY);
    await storeRaw({ count: 2, items: ['a', 7], extra: true });
    expect(await counter.get()).toEqual({ count: 2, items: ['a'] });
  });

  it('reads anything that is not an envelope as empty and replaces it on write', async () => {
    await fakeBrowser.storage.local.set({ [KEY]: { count: 2, items: ['a'] } });
    expect(await counter.get()).toEqual(EMPTY);
    await counter.update((current) => ({ ...current, count: current.count + 1 }));
    expect(await stored()).toEqual({ v: 2, data: { count: 1, items: [] } });
  });

  it('stores the parsed value as { v, data } under its key and area, and removes an empty value', async () => {
    await counter.set({ count: 1, items: ['x'] });
    expect(await stored()).toEqual({ v: 2, data: { count: 1, items: ['x'] } });
    expect(await fakeBrowser.storage.sync.get()).toEqual({});

    await counter.set(EMPTY);
    expect(await fakeBrowser.storage.local.get()).toEqual({});

    await counter.set({ count: 3, items: [] });
    await counter.clear();
    expect(await fakeBrowser.storage.local.get()).toEqual({});
  });

  it('migrates data from an older version on read and stores the current version', async () => {
    await storeRaw({ total: 4 }, 1);
    expect(await counter.get()).toEqual({ count: 4, items: [] });
    await counter.update((current) => ({ ...current, items: ['a'] }));
    expect(await stored()).toEqual({ v: 2, data: { count: 4, items: ['a'] } });
  });

  it('reads data from a newer version but never overwrites it', async () => {
    await storeRaw({ count: 5, items: ['new'], added: true }, 3);
    expect(await counter.get()).toEqual({ count: 5, items: ['new'] });

    const change = vi.fn((current: Counter) => ({ ...current, count: 6 }));
    await expect(counter.update(change)).rejects.toBeInstanceOf(NewerStoredValueError);
    await expect(counter.set(EMPTY)).rejects.toThrow(
      'A newer version of Bookmark Scout saved this. Update the extension to change it.',
    );
    await expect(counter.clear()).rejects.toBeInstanceOf(NewerStoredValueError);
    expect(change).not.toHaveBeenCalled();
    expect(await stored()).toEqual({ v: 3, data: { count: 5, items: ['new'], added: true } });
  });

  it('reads data that fails the schema as empty', async () => {
    const item: StorageItem = { area: 'local', name: 'test.flag', v: 1, backup: 'exclude' };
    const flag = defineStoredValue<boolean>(item, { schema: z.boolean(), empty: false });
    expect(await flag.get()).toBe(false);
    await seedStored(item, 'yes');
    expect(await flag.get()).toBe(false);
    await flag.set(true);
    expect(await readStoredRaw(item)).toEqual({ v: 1, data: true });
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
    expect(await stored()).toEqual({ v: 2, data: { count: 3, items: ['a', 'b', 'c'] } });
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
    expect(await stored()).toEqual({ v: 2, data: { count: 2, items: [] } });
  });

  it('watches parsed changes from any page', async () => {
    const seen: Counter[] = [];
    const unwatch = counter.watch((value) => seen.push(value));
    await storeRaw({ count: 5 });
    await fakeBrowser.storage.local.remove(KEY);
    unwatch();
    expect(seen).toEqual([{ count: 5, items: [] }, EMPTY]);
  });
});

describe('writes from several pages', () => {
  /** The same item defined in `pages` separate module instances, as separate pages would. */
  async function definePerPage(pages: number) {
    const values = [];
    for (let page = 0; page < pages; page += 1) {
      vi.resetModules();
      const module = await import('@/lib/storage/stored-value');
      values.push(
        module.defineStoredValue<Counter>(ITEM, { parse: parseCounter, empty: EMPTY, migrations }),
      );
    }
    return values;
  }

  const addItem = (item: string) => (current: Counter) => ({
    count: current.count + 1,
    items: [...current.items, item],
  });

  it('holds a Web Lock named after the key around each write', async () => {
    const names: string[] = [];
    const request = vi.fn(async (name: string, task: () => Promise<unknown>) => {
      names.push(name);
      return task();
    });
    vi.stubGlobal('navigator', { locks: { request } });
    await counter.update(addItem('a'));
    await counter.set(EMPTY);
    await counter.clear();
    expect(names).toEqual(['local:test.counter', 'local:test.counter', 'local:test.counter']);
  });

  it('loses no update when two pages change the same item at once', async () => {
    // One lock manager for every page, as the browser has per extension origin (Node may lack it).
    const held = new Map<string, Promise<unknown>>();
    const request = (name: string, task: () => Promise<unknown>) => {
      const run = (held.get(name) ?? Promise.resolve()).then(task, task);
      held.set(
        name,
        run.catch(() => undefined),
      );
      return run;
    };
    vi.stubGlobal('navigator', { locks: { request } });
    slowReads();
    const [first, second] = await definePerPage(2);
    await Promise.all([
      first.update(addItem('a')),
      second.update(addItem('b')),
      first.update(addItem('c')),
      second.update(addItem('d')),
    ]);
    const data = ((await stored()) as { data: Counter }).data;
    expect(data.count).toBe(4);
    expect([...data.items].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('queues writes per page where Web Locks are missing', async () => {
    vi.stubGlobal('navigator', {});
    slowReads();
    await Promise.all(['a', 'b', 'c'].map((item) => counter.update(addItem(item))));
    expect(await stored()).toEqual({ v: 2, data: { count: 3, items: ['a', 'b', 'c'] } });
  });
});

describe('observe', () => {
  it('delivers the loaded value, then each change, then stops', async () => {
    await counter.set({ count: 1, items: [] });
    const seen: number[] = [];
    const stop = counter.observe((value) => seen.push(value.count));
    await vi.waitFor(() => expect(seen).toEqual([1]));

    await counter.update((current) => ({ ...current, count: 2 }));
    await storeRaw({ count: 3 });
    await vi.waitFor(() => expect(seen).toEqual([1, 2, 3]));

    stop();
    await storeRaw({ count: 4 });
    expect(seen).toEqual([1, 2, 3]);
  });

  it('keeps a change from storage over an initial read that resolves later', async () => {
    await storeRaw({ count: 1 });
    const { release } = await holdNextRead();
    const seen: number[] = [];
    const stop = counter.observe((value) => seen.push(value.count));

    await storeRaw({ count: 2 });
    await vi.waitFor(() => expect(seen).toEqual([2]));
    await release();

    expect(seen).toEqual([2]);
    stop();
  });

  it('keeps this page’s own write over an initial read that resolves later', async () => {
    await storeRaw({ count: 1 });
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

describe('preloadStoredValue', () => {
  it('resolves once read and keeps the value for the first render of later readers', async () => {
    await storeRaw({ count: 5 });
    // Its own copy, so the subscription it keeps does not touch the other tests' counter.
    const preloaded = defineCounter();
    const live = getStoredValueStore(preloaded);
    expect(live.getSnapshot().isLoading).toBe(true);

    await preloadStoredValue(preloaded);

    // What `useStoredValue` reads on a component's first render, with no read of its own.
    expect(live.getSnapshot()).toEqual({ value: { count: 5, items: [] }, isLoading: false });
    const stop = live.subscribe(() => undefined);
    stop();
    expect(live.getSnapshot().isLoading).toBe(false);
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
    await seedStored(STORAGE_ITEMS.siteIcons, { 'https://example.com': { icon, fetchedAt: 1 } });
    // The storage event lands first; the slow first read must not undo it.
    await vi.waitFor(() => expect(useSiteIconStore.getState().count).toBe(1));
    await release();

    expect(useSiteIconStore.getState()).toMatchObject({ loaded: true, count: 1 });
    expect(useSiteIconStore.getState().byOrigin['https://example.com']).toBe(icon);
  });
});
