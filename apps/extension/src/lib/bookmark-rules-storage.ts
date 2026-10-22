/**
 * The smart rules (`bookmark-rules.ts`), in the order they run. They stay in local storage and are
 * never synced: they name folder ids that are local to this browser profile, and their searches
 * can reveal what is bookmarked. A backup carries them; a rule whose folder is not in the profile
 * it is restored to cannot move anything until its folder is chosen again.
 */

/** In the order they run. */
export const bookmarkRulesValue = defineStoredValue<BookmarkRule[]>(STORAGE_ITEMS.bookmarkRules, {
  parse: parseBookmarkRules,
  empty: [],
});

/** A new rule's id. */
export function createBookmarkRuleId(): string {
  return crypto.randomUUID();
}

/** Adds `rule`, or replaces the rule with its id where it is, keeping the order. */
export function saveBookmarkRule(rule: BookmarkRule): Promise<BookmarkRule[]> {
  return bookmarkRulesValue.update((current) => {
    const index = current.findIndex((entry) => entry.id === rule.id);
    if (index === -1) return [...current, rule].slice(0, MAX_BOOKMARK_RULES);
    return current.map((entry) => (entry.id === rule.id ? rule : entry));
  });
}

export function deleteBookmarkRule(id: string): Promise<BookmarkRule[]> {
  return bookmarkRulesValue.update((current) => current.filter((rule) => rule.id !== id));
}

export function setBookmarkRuleEnabled(id: string, enabled: boolean): Promise<BookmarkRule[]> {
  return bookmarkRulesValue.update((current) =>
    current.map((rule) => (rule.id === id ? { ...rule, enabled } : rule)),
  );
}

/** Puts the rules in the order of `ids`, which decides which move wins. */
export function reorderBookmarkRules(ids: readonly string[]): Promise<BookmarkRule[]> {
  return bookmarkRulesValue.update((current) => orderByIds(current, (rule) => rule.id, ids));
}

/** Puts a deleted rule back at `index`, unless a rule with its id is there again. */
export function restoreBookmarkRule(rule: BookmarkRule, index: number): Promise<BookmarkRule[]> {
  return bookmarkRulesValue.update((current) => {
    if (current.some((entry) => entry.id === rule.id)) return current;
    const next = [...current];
    next.splice(Math.min(index, next.length), 0, rule);
    return next.slice(0, MAX_BOOKMARK_RULES);
  });
}
