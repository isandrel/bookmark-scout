/**
 * The bookmark manager's row selection, as in Chrome's manager (`selectItem` in its reducers): a
 * click selects one row, Ctrl (Cmd on a Mac) adds or removes one, and Shift selects the range
 * from the anchor, the row clicked last without Shift.
 */

export type RowSelectionChange = {
  /** Start from an empty selection. */
  clear: boolean;
  /** Select from the anchor to the target, in display order; the anchor stays. */
  range: boolean;
  /** Add or remove the target instead of adding it. */
  toggle: boolean;
};

export type ManagerRowSelection = { selected: ReadonlySet<string>; anchorId: string | null };

/** The change a click or arrow key makes, from its modifier keys. */
export function rowSelectionChangeFor(modifiers: {
  shiftKey: boolean;
  /** Ctrl, or Cmd on a Mac. */
  toggleKey: boolean;
}): RowSelectionChange {
  return {
    clear: !modifiers.toggleKey,
    range: modifiers.shiftKey,
    toggle: modifiers.toggleKey && !modifiers.shiftKey,
  };
}

/**
 * The selection after `change` at `targetId`. `orderedIds` are the rows in display order (on
 * every page); rows `canSelect` refuses (top-level folders) are never selected.
 */
export function selectRows(
  state: ManagerRowSelection,
  orderedIds: readonly string[],
  targetId: string,
  change: RowSelectionChange,
  canSelect: (id: string) => boolean = () => true,
): ManagerRowSelection {
  const selected = new Set(change.clear ? [] : state.selected);
  const anchorIndex = state.anchorId === null ? -1 : orderedIds.indexOf(state.anchorId);
  const targetIndex = orderedIds.indexOf(targetId);
  if (change.range && anchorIndex >= 0 && targetIndex >= 0) {
    const [from, to] = [Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex)];
    for (const id of orderedIds.slice(from, to + 1)) if (canSelect(id)) selected.add(id);
    return { selected, anchorId: state.anchorId };
  }
  if (change.toggle && selected.has(targetId)) selected.delete(targetId);
  else if (canSelect(targetId)) selected.add(targetId);
  return { selected, anchorId: targetId };
}

/**
 * The row that takes focus when the focused row `removedId` leaves the list (deleted, or moved
 * out of the folder), as in Chrome's manager: the next row that is still there, else the nearest
 * one before it. Null when none of the earlier rows are left.
 */
export function rowAfterRemoval(
  previousIds: readonly string[],
  currentIds: readonly string[],
  removedId: string,
): string | null {
  const index = previousIds.indexOf(removedId);
  if (index < 0) return null;
  const present = new Set(currentIds);
  const next = previousIds.slice(index + 1).find((id) => present.has(id));
  if (next) return next;
  return (
    previousIds
      .slice(0, index)
      .reverse()
      .find((id) => present.has(id)) ?? null
  );
}
