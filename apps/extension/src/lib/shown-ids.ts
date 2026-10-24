/**
 * Settings that list what a part of a page shows, in the user's order: the popup's parts, toolbar
 * buttons, and hover card details; the manager's card and preview details, Tools sidebar, and
 * menus; the popup's row menus; and the right-click menu's entries. Each choice is an id of a
 * table in config or code (its "choices"), and a stored list holds:
 * - each id the user shows, in their order;
 * - each id the user hid, marked with `HIDDEN_ID_MARK` (`!cover`).
 *
 * An id of the choices that the list does not name at all was added after the list was saved, so
 * it shows, in its configured place: after the configured choice before it that shows, else
 * before the one after it, else at the end. An empty list therefore shows every choice in the
 * configured order, and a release that adds a choice shows it to everyone, also to users who
 * arranged the list before, until they hide it. A default that hides a choice marks it the same
 * way in `config/settings/`.
 *
 * Lists saved before hidden ids were marked (builds before 0.3.5 that never reached a store
 * release) show the ids they left out once more, until the user hides them again. The item menu
 * 0.3.4 stored is the exception: the storage migration `2026-10-sync-list-shards` writes it with
 * the actions it left out marked hidden (`markItemMenu0_3_4`).
 */

/** Marks an id the user hid in a stored list of shown ids. */
export const HIDDEN_ID_MARK = '!';

/** The id a hidden entry names, or undefined for an entry that is not marked hidden. */
export function hiddenIdOf(entry: string): string | undefined {
  return entry.startsWith(HIDDEN_ID_MARK) ? entry.slice(HIDDEN_ID_MARK.length) : undefined;
}

/**
 * The ids of `choices` that `stored` shows, in its order and once each, and the choices it does
 * not name at all, shown or hidden, in the configured order: those added since it was saved.
 * Ids this release does not know (synced from a newer one) are skipped.
 */
export function splitShownIds<T extends string>(
  stored: readonly string[],
  choices: readonly T[],
): { shown: T[]; added: T[] } {
  const known = new Set<string>(choices);
  const named = new Set<string>();
  const shown: T[] = [];
  for (const entry of stored) {
    const id = hiddenIdOf(entry) ?? entry;
    if (!known.has(id) || named.has(id)) continue;
    named.add(id);
    if (id === entry) shown.push(id as T);
  }
  return { shown, added: choices.filter((id) => !named.has(id)) };
}

/**
 * `sections` with each of `added` put in its configured place (`configured` holds every choice by
 * its configured section): after the nearest choice before it in its configured section that
 * `sections` holds, else before the nearest one after it, else as a section of its own at the
 * end. Added ids are placed in the configured order, so one can follow another.
 */
export function placeAddedIds<T extends string>(
  sections: readonly (readonly T[])[],
  added: readonly T[],
  configured: readonly (readonly T[])[],
): T[][] {
  const result = sections.map((section) => [...section]);
  const placeOf = (id: T) => {
    for (const [index, section] of result.entries()) {
      const at = section.indexOf(id);
      if (at >= 0) return { section: result[index] as T[], at };
    }
    return undefined;
  };
  const toAdd = new Set(added);
  for (const group of configured) {
    for (const [index, id] of group.entries()) {
      if (!toAdd.has(id)) continue;
      const before = group
        .slice(0, index)
        .reverse()
        .map(placeOf)
        .find((place) => place !== undefined);
      const after = group
        .slice(index + 1)
        .map(placeOf)
        .find((place) => place !== undefined);
      if (before) before.section.splice(before.at + 1, 0, id);
      else if (after) after.section.splice(after.at, 0, id);
      else result.push([id]);
    }
  }
  return result;
}

/**
 * The ids of `choices` a stored list shows, in order: the ids it shows, then the choices added
 * since it was saved, each in its configured place, then any of `required` it still leaves out.
 */
export function readShownIds<T extends string>(
  stored: readonly string[],
  choices: readonly T[],
  required: readonly T[] = [],
): T[] {
  const { shown, added } = splitShownIds(stored, choices);
  const placed = placeAddedIds([shown], added, [choices]).flat();
  return [...placed, ...required.filter((id) => !placed.includes(id))];
}

/** Each of `choices` that `shown` leaves out, marked hidden, in the configured order. */
export function hiddenEntries(shown: readonly string[], choices: readonly string[]): string[] {
  const shownIds = new Set(shown);
  return choices.filter((id) => !shownIds.has(id)).map((id) => `${HIDDEN_ID_MARK}${id}`);
}

/** What a list setting stores for `shown`: those ids in order, then every other choice, hidden. */
export function encodeShownIds(shown: readonly string[], choices: readonly string[]): string[] {
  return [...shown, ...hiddenEntries(shown, choices)];
}
