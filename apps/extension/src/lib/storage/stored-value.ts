/**
 * One registered item in extension storage (`local`, `sync`, or `session`; see
 * `storage/registry.ts`), read and written as a whole.
 *
 * The item is stored as `{ v, data }`. Every read goes through `parse` (or `schema`), so callers
 * only ever see valid data; something that is not an envelope, or data that fails the schema,
 * reads as `empty`. Data from an older `v` is migrated step by step on read. Data from a newer `v`
 * (written by a newer release on another device) is read as well as this release can, but every
 * write rejects with `NewerStoredValueError`, so it is never overwritten.
 *
 * Writes to one key run one at a time across every page and the background: `update` and `set`
 * hold a Web Lock named after the key and `update` re-reads inside it, so read-modify-write callers
 * on different pages never overwrite each other. Where Web Locks are missing, writes queue per
 * page. Each page keeps one live copy per key, shared by every `useStoredValue` and `observe`
 * caller; a value delivered by the storage watcher always wins over an initial read that resolves
 * later.
 *
 * No React here: the background reads stored values too. The hook is in
 * `hooks/use-stored-value.ts`.
 */
import type { z } from 'zod';
import { type StorageItem, type StorageKey, storageKey } from './registry';

/** Turns stored data of version `v` into data of version `v + 1`. */
export type StoredValueMigration = (data: unknown) => unknown;

export type StoredValueOptions<T> = {
  /** The value before the first read, and when storage holds nothing usable. */
  empty: T;
  /** A value it accepts is not stored: the key is removed instead. */
  isEmpty?: (value: T) => boolean;
  /** Steps from each older version, keyed by the version they start from (1 to `v - 1`). */
  migrations?: Readonly<Record<number, StoredValueMigration>>;
  /** The entry's id when `item` is a collection. */
  id?: string;
} & (
  | {
      /** Turns whatever storage holds, including nothing (`null`), into a valid value. */
      parse: (raw: unknown) => T;
      schema?: never;
    }
  | {
      /** Data that fails it reads as `empty`. */
      schema: z.ZodType<T>;
      parse?: never;
    }
);

export type StoredSnapshot<T> = { value: T; isLoading: boolean };

export type StoredValue<T> = {
  readonly item: StorageItem;
  readonly key: StorageKey;
  readonly empty: T;
  /** Steps from each older version, as passed to `defineStoredValue`. */
  readonly migrations: Readonly<Record<number, StoredValueMigration>>;
  /** The parsed stored value. Rejects when storage cannot be read. */
  get: () => Promise<T>;
  /** Parses and stores `value` (or removes the key when it is empty); resolves to what was stored. */
  set: (value: T) => Promise<T>;
  /**
   * Reads the current value, applies `change`, and stores the parsed result, behind every other
   * write to this key on any page. Nothing is written when `change` throws or returns an equal
   * value. Resolves to the value now stored.
   */
  update: (change: (current: T) => T | Promise<T>) => Promise<T>;
  /** Removes the key. */
  clear: () => Promise<void>;
  /** Calls back with the parsed value after each change from any page or device. */
  watch: (callback: (value: T) => void) => () => void;
  /** Calls back with the current value once it is loaded, then after each change. */
  observe: (callback: (value: T) => void) => () => void;
};

/**
 * A value read and watched like a stored value; a derived one (`defineDerivedValue`) is written
 * through the stored values it is computed from.
 */
export type ReadableStoredValue<T> = Pick<StoredValue<T>, 'get' | 'watch' | 'observe'>;

/** A write refused because a newer release stored the item. */
export class NewerStoredValueError extends Error {
  constructor(readonly key: StorageKey) {
    super(t('error_storedByNewerVersion'));
    this.name = 'NewerStoredValueError';
  }
}

type Envelope = { v: number; data: unknown };

/** What storage holds for `data` of `item`. */
export function toStoredEnvelope(item: StorageItem, data: unknown): Envelope {
  return { v: item.v, data };
}

function isEnvelope(raw: unknown): raw is Envelope {
  return isPlainObject(raw) && Number.isInteger(raw.v) && (raw.v as number) > 0 && 'data' in raw;
}

/** What `raw` holds for `item`, migrated to its version, and whether a newer release wrote it. */
function openEnvelope(
  raw: unknown,
  item: StorageItem,
  migrations: Readonly<Record<number, StoredValueMigration>>,
): { data: unknown; newer: boolean } {
  if (!isEnvelope(raw)) return { data: null, newer: false };
  if (raw.v > item.v) return { data: raw.data, newer: true };
  let { data } = raw;
  for (let version = raw.v; version < item.v; version += 1) {
    const step = migrations[version];
    if (!step) return { data: null, newer: false };
    data = step(data);
  }
  return { data, newer: false };
}

type LiveValue<T> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => StoredSnapshot<T>;
  /** A value this page just stored, so its readers need not wait for the storage event. */
  publish: (value: T) => void;
};

// Writes per key on this page when Web Locks are missing.
const writeQueues = new Map<string, Promise<unknown>>();

function enqueueWrite<R>(key: string, task: () => Promise<R>): Promise<R> {
  const run = (writeQueues.get(key) ?? Promise.resolve()).then(task, task);
  writeQueues.set(
    key,
    run.catch(() => undefined),
  );
  return run;
}

/**
 * Runs `task` while holding the key's lock, shared by every extension page, the background, and
 * the offscreen document (one origin). Falls back to this page's queue without Web Locks.
 */
function withKeyLock<R>(key: string, task: () => Promise<R>): Promise<R> {
  const locks = globalThis.navigator?.locks;
  if (typeof locks?.request !== 'function') return enqueueWrite(key, task);
  return locks.request(key, task) as Promise<R>;
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

export function defineStoredValue<T>(
  item: StorageItem,
  options: StoredValueOptions<T>,
): StoredValue<T> {
  const { empty, isEmpty, migrations = {}, id } = options;
  const key = storageKey(item, id);
  const parseData = (data: unknown): T => {
    if (options.parse) return options.parse(data);
    const parsed = options.schema.safeParse(data);
    return parsed.success ? parsed.data : empty;
  };
  const readRaw = (raw: unknown) => {
    const { data, newer } = openEnvelope(raw, item, migrations);
    return { value: parseData(data), newer };
  };

  const get = async () => readRaw(await storage.getItem(key)).value;
  const watch = (callback: (value: T) => void) =>
    storage.watch(key, (raw: unknown) => callback(readRaw(raw).value));
  const live = createLiveValue(empty, get, watch);

  /** The stored value, after making sure no newer release wrote it. */
  const readWritable = async (): Promise<T> => {
    const { value, newer } = readRaw(await storage.getItem(key));
    if (newer) throw new NewerStoredValueError(key);
    return value;
  };

  const write = async (value: T): Promise<T> => {
    const next = parseData(value);
    if (isEmpty?.(next)) {
      await storage.removeItem(key);
    } else {
      await storage.setItem(key, toStoredEnvelope(item, next));
    }
    live.publish(next);
    return next;
  };

  const storedValue: StoredValue<T> = {
    item,
    key,
    empty,
    migrations,
    get,
    set: (value) =>
      withKeyLock(key, async () => {
        await readWritable();
        return write(value);
      }),
    update: (change) =>
      withKeyLock(key, async () => {
        const current = await readWritable();
        const next = await change(current);
        return isSameJson(next, current) ? current : write(next);
      }),
    clear: () =>
      withKeyLock(key, async () => {
        await readWritable();
        await storage.removeItem(key);
        live.publish(parseData(null));
      }),
    watch,
    observe: (callback) => observeLive(live, callback),
  };
  liveValues.set(storedValue, live as LiveValue<unknown>);
  return storedValue;
}

/** Calls back with the live value once it is loaded, then after each change. */
function observeLive<T>(live: LiveValue<T>, callback: (value: T) => void): () => void {
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
}

/**
 * A value computed from several stored values. Its live copy follows theirs, so it changes as
 * soon as any of them changes, from this page (before the storage event) or any other.
 */
export function defineDerivedValue<S extends readonly unknown[], T>(
  sources: { readonly [K in keyof S]: StoredValue<S[K]> },
  combine: (values: S) => T,
  empty: T,
): ReadableStoredValue<T> {
  const lives = (sources as readonly StoredValue<unknown>[]).map(liveValueOf);
  let snapshot: StoredSnapshot<T> = { value: empty, isLoading: true };
  let stops: (() => void)[] | undefined;
  const listeners = new Set<() => void>();

  const recompute = () => {
    const parts = lives.map((live) => live.getSnapshot());
    if (parts.some((part) => part.isLoading)) return;
    const value = combine(parts.map((part) => part.value) as unknown as S);
    if (!snapshot.isLoading && isSameJson(snapshot.value, value)) return;
    snapshot = { value, isLoading: false };
    for (const listener of [...listeners]) listener();
  };

  const live: LiveValue<T> = {
    subscribe(listener) {
      listeners.add(listener);
      if (!stops) {
        stops = lives.map((source) => source.subscribe(recompute));
        recompute();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        for (const stop of stops ?? []) stop();
        stops = undefined;
        snapshot = { value: snapshot.value, isLoading: true };
      };
    },
    getSnapshot: () => snapshot,
    publish: () => undefined,
  };

  const derived: ReadableStoredValue<T> = {
    get: async () =>
      combine(
        (await Promise.all(
          (sources as readonly StoredValue<unknown>[]).map((source) => source.get()),
        )) as unknown as S,
      ),
    watch(callback) {
      // Changes only: the value loaded first is not one.
      let loaded = false;
      return observeLive(live, (value) => {
        if (loaded) callback(value);
        loaded = true;
      });
    },
    observe: (callback) => observeLive(live, callback),
  };
  liveValues.set(derived, live as LiveValue<unknown>);
  return derived;
}

function liveValueOf<T>(value: ReadableStoredValue<T>): LiveValue<T> {
  const live = liveValues.get(value);
  if (!live) throw new Error('Not a stored or derived value');
  return live as LiveValue<T>;
}

/**
 * The page's live copy of a stored value as an external store: `useStoredValue`
 * (`hooks/use-stored-value.ts`) reads it with `useSyncExternalStore`.
 */
export function getStoredValueStore<T>(
  storedValue: ReadableStoredValue<T>,
): Pick<LiveValue<T>, 'subscribe' | 'getSnapshot'> {
  const { subscribe, getSnapshot } = liveValueOf(storedValue);
  return { subscribe, getSnapshot };
}
