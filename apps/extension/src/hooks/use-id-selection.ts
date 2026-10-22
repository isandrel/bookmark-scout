import { useEffect, useState } from 'react';

export type IdSelection = {
  selected: ReadonlySet<string>;
  /** Selects or clears one item. */
  toggle: (id: string, checked: boolean) => void;
  /** Selects or clears every item in `ids`, leaving the others as they are. */
  setMany: (ids: readonly string[], checked: boolean) => void;
};

/**
 * Which items of a review are selected, by id. It starts as `initial` and starts again whenever
 * `initial` is a new list (a new scan).
 */
export function useIdSelection(initial: readonly string[]): IdSelection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(initial));
  useEffect(() => {
    setSelected(new Set(initial));
  }, [initial]);
  const setMany = (ids: readonly string[], checked: boolean) =>
    setSelected((previous) => {
      const next = new Set(previous);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  return { selected, toggle: (id, checked) => setMany([id], checked), setMany };
}
