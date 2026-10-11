import { useSyncExternalStore } from 'react';

const identity = <T>(value: T) => value;

/**
 * The live stored value for React: `empty` and `isLoading` until the first read, then every change
 * from any page or device. All components on a page share one storage read and one watcher per key.
 * `select` picks a part of the value (return a part, not a new object), so a component re-renders
 * only when that part changes.
 */
export function useStoredValue<T>(storedValue: ReadableStoredValue<T>): StoredSnapshot<T>;
export function useStoredValue<T, S>(
  storedValue: ReadableStoredValue<T>,
  select: (value: T) => S,
): StoredSnapshot<S>;
export function useStoredValue<T, S>(
  storedValue: ReadableStoredValue<T>,
  select: (value: T) => S = identity as (value: T) => S,
): StoredSnapshot<S> {
  const live = getStoredValueStore(storedValue);
  const readValue = () => select(live.getSnapshot().value);
  const readLoading = () => live.getSnapshot().isLoading;
  // The same snapshot serves server rendering (unit tests render components to a string).
  const value = useSyncExternalStore(live.subscribe, readValue, readValue);
  const isLoading = useSyncExternalStore(live.subscribe, readLoading, readLoading);
  return { value, isLoading };
}
