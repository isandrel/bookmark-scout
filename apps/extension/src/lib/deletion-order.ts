/**
 * Pure helpers that remember where deleted bookmarks sat among their siblings, so undoing
 * several deletions in any order puts every item back in its original place.
 *
 * A folder's reference order lists its live children plus "tombstones" for deleted children that
 * can still be restored. Each deletion refreshes the order from the live folder, keeping earlier
 * tombstones where they were; a restore goes before the nearest live item that followed it.
 */

/** Refreshes a folder's reference order from its live child IDs, keeping known tombstones. */
export function mergeSiblingOrder(
  previous: readonly string[] | undefined,
  live: readonly string[],
  isTombstone: (id: string) => boolean,
): string[] {
  const liveIds = new Set(live);
  const order = (previous ?? []).filter((id) => liveIds.has(id) || isTombstone(id));
  const known = new Set(order);
  // Children new to the order go right after the live child that precedes them.
  for (const [position, id] of live.entries()) {
    if (known.has(id)) continue;
    const before = position > 0 ? order.indexOf(live[position - 1]) : -1;
    order.splice(before + 1, 0, id);
    known.add(id);
  }
  return order;
}

/**
 * Browser index at which to restore `id`: before the nearest later sibling that is live again,
 * else after the nearest earlier live one, else first. Undefined when `id` is not in the order.
 */
export function findRestoreIndex(
  order: readonly string[],
  id: string,
  liveIndexById: ReadonlyMap<string, number>,
): number | undefined {
  const position = order.indexOf(id);
  if (position < 0) return undefined;
  for (let next = position + 1; next < order.length; next += 1) {
    const index = liveIndexById.get(order[next]);
    if (index !== undefined) return index;
  }
  for (let previous = position - 1; previous >= 0; previous -= 1) {
    const index = liveIndexById.get(order[previous]);
    if (index !== undefined) return index + 1;
  }
  return 0;
}
