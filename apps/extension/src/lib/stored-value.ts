/**
 * One value in extension storage (`local` or `sync`), read and written as a whole.
 *
 * Every read goes through `parse`, so callers only ever see valid data, whatever an older release
 * or another device stored. Writes to one key run one at a time on this page (`update` re-reads
 * inside that queue), so concurrent read-modify-write callers never overwrite each other. Each
 * page keeps one live copy per key, shared by every `useStoredValue` and `observe` caller; a
 * value delivered by the storage watcher always wins over an initial read that resolves later.
 */

import { useSyncExternalStore } from 'react';

/** A WXT storage key, `<area>:<name>`; released keys are listed in STORAGE_KEYS. */
export type StoredValueKey = `local:${string}` | `sync:${string}`;

export type StoredValueOptions<T> = {
  key: StoredValueKey;
  /** Turns whatever storage holds, including nothing (`null`), into a valid value. */
  parse: (raw: unknown) => T;
  /** The value before the first read, and when storage cannot be read. */
  empty: T;
  /** A value it accepts is not stored: the key is removed instead. */
  isEmpty?: (value: T) => boolean;
};

export type StoredSnapshot<T> = { value: T; isLoading: boolean };

export type StoredValue<T> = {
  readonly key: StoredValueKey;
  /** The parsed stored value. Rejects when storage cannot be read. */
  get: () => Promise<T>;
  /** Parses and stores `value` (or removes the key when it is empty); resolves to what was stored. */
  set: (value: T) => Promise<T>;
  /**
   * Reads the current value, applies `change`, and stores the parsed result, queued behind every
   * other write to this key on this page. Nothing is written when `change` throws or returns an
   * equal value. Resolves to the value now stored.
   */
  update: (change: (current: T) => T | Promise<T>) => Promise<T>;
  /** Removes the key. */
  clear: () => Promise<void>;
  /** Calls back with the parsed value after each change from any page or device. */
  watch: (callback: (value: T) => void) => () => void;
  /** Calls back with the current value once it is loaded, then after each change. */
  observe: (callback: (value: T) => void) => () => void;
};

type LiveValue<T> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => StoredSnapshot<T>;
  /** A value this page just stored, so its readers need not wait for the storage event. */
  publish: (value: T) => void;
};

// Writes per key, shared by every StoredValue for that key on this page.
const writeQueues = new Map<string, Promise<unknown>>();

function enqueueWrite<R>(key: string, task: () => Promise<R>): Promise<R> {
  const run = (writeQueues.get(key) ?? Promise.resolve()).then(task, task);
  writeQueues.set(
    key,
    run.catch(() => undefined),
  );
  return run;
}

function createLiveValue<T>(
  empty: T,
  read: () => Promise<T>,
  watch: (callback: (value: T) => void) => () => void,
): LiveValue<T> {
  let snapshot: StoredSnapshot<T> = { value: empty, isLoading: true };
  let version = 0;
  let stop: (() => void) | undefined;
  const listeners = new Set<() => void>();

  const publish = (value: T) => {
    version += 1;
    if (!snapshot.isLoading && isSameJson(snapshot.value, value)) return;
    snapshot = { value, isLoading: false };
    for (const listener of [...listeners]) listener();
  };

  const start = () => {
    let active = true;
    const unwatch = watch((value) => {
      if (active) publish(value);
    });
    // Anything published after this read started is newer than what it returns.
    const readVersion = version;
    read().then(
      (value) => {
        if (active && version === readVersion) publish(value);
      },
      () => {
        if (active && version === readVersion) publish(empty);
      },
    );
    stop = () => {
      active = false;
      unwatch();
      stop = undefined;
      // Unwatched changes may follow, so the next subscriber waits for a fresh read.
      snapshot = { value: snapshot.value, isLoading: true };
    };
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (!stop) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop?.();
      };
    },
    getSnapshot: () => snapshot,
    publish(value) {
      if (stop) publish(value);
    },
  };
}

const liveValues = new WeakMap<object, LiveValue<unknown>>();

export function defineStoredValue<T>({
  key,
  parse,
  empty,
  isEmpty,
}: StoredValueOptions<T>): StoredValue<T> {
  const get = async () => parse(await storage.getItem(key));
  const watch = (callback: (value: T) => void) =>
    storage.watch(key, (raw: unknown) => callback(parse(raw)));
  const live = createLiveValue(empty, get, watch);

  const write = async (value: T): Promise<T> => {
    const next = parse(value);
    if (isEmpty?.(next)) {
      await storage.removeItem(key);
    } else {
      await storage.setItem(key, next);
    }
    live.publish(next);
    return next;
  };

  const storedValue: StoredValue<T> = {
    key,
    get,
    set: (value) => enqueueWrite(key, () => write(value)),
    update: (change) =>
      enqueueWrite(key, async () => {
        const current = await get();
        const next = await change(current);
        return isSameJson(next, current) ? current : write(next);
      }),
    clear: () =>
      enqueueWrite(key, async () => {
        await storage.removeItem(key);
        live.publish(parse(null));
      }),
    watch,
    observe(callback) {
      let delivered: StoredSnapshot<T> | undefined;
      const notify = () => {
        const snapshot = live.getSnapshot();
        if (snapshot.isLoading || snapshot === delivered) return;
        delivered = snapshot;
        callback(snapshot.value);
      };
      const unsubscribe = live.subscribe(notify);
      notify();
      return unsubscribe;
    },
  };
  liveValues.set(storedValue, live as LiveValue<unknown>);
  return storedValue;
}

function liveValueOf<T>(storedValue: StoredValue<T>): LiveValue<T> {
  const live = liveValues.get(storedValue);
  if (!live) throw new Error(`${storedValue.key} was not created by defineStoredValue`);
  return live as LiveValue<T>;
}

const identity = <T>(value: T) => value;

/**
 * The live stored value for React: `empty` and `isLoading` until the first read, then every change
 * from any page or device. All components on a page share one storage read and one watcher per key.
 * `select` picks a part of the value (return a part, not a new object), so a component re-renders
 * only when that part changes.
 */
export function useStoredValue<T>(storedValue: StoredValue<T>): StoredSnapshot<T>;
export function useStoredValue<T, S>(
  storedValue: StoredValue<T>,
  select: (value: T) => S,
): StoredSnapshot<S>;
export function useStoredValue<T, S>(
  storedValue: StoredValue<T>,
  select: (value: T) => S = identity as (value: T) => S,
): StoredSnapshot<S> {
  const live = liveValueOf(storedValue);
  const value = useSyncExternalStore(live.subscribe, () => select(live.getSnapshot().value));
  const isLoading = useSyncExternalStore(live.subscribe, () => live.getSnapshot().isLoading);
  return { value, isLoading };
}
