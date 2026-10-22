import { beforeEach, describe, expect, it } from 'vitest';
import { type BookmarkRule, MAX_BOOKMARK_RULES } from '@/lib/bookmark-rules';
import {
  bookmarkRulesValue,
  createBookmarkRuleId,
  deleteBookmarkRule,
  reorderBookmarkRules,
  restoreBookmarkRule,
  saveBookmarkRule,
  setBookmarkRuleEnabled,
} from '@/lib/bookmark-rules-storage';
import { SEARCH_SYNTAX_VERSION } from '@/lib/search-query';

const rule = (id: string, overrides: Partial<BookmarkRule> = {}): BookmarkRule => ({
  id,
  name: `Rule ${id}`,
  enabled: true,
  query: `title:${id}`,
  syntaxVersion: SEARCH_SYNTAX_VERSION,
  addTags: [id],
  ...overrides,
});

const ids = async () => (await bookmarkRulesValue.get()).map((entry) => entry.id);

describe('stored smart rules', () => {
  beforeEach(async () => {
    await bookmarkRulesValue.set([]);
  });

  it('adds new rules at the end and replaces an edited one where it is', async () => {
    await saveBookmarkRule(rule('a'));
    await saveBookmarkRule(rule('b'));
    await saveBookmarkRule(rule('a', { name: 'Renamed' }));
    expect(await ids()).toEqual(['a', 'b']);
    expect((await bookmarkRulesValue.get())[0]?.name).toBe('Renamed');
  });

  it('keeps no more than the configured number of rules', async () => {
    await bookmarkRulesValue.set(
      Array.from({ length: MAX_BOOKMARK_RULES }, (_, n) => rule(`r${n}`)),
    );
    await saveBookmarkRule(rule('extra'));
    expect(await ids()).not.toContain('extra');
  });

  it('turns a rule off, reorders, deletes, and restores it at its place', async () => {
    await bookmarkRulesValue.set([rule('a'), rule('b'), rule('c')]);
    await setBookmarkRuleEnabled('b', false);
    expect((await bookmarkRulesValue.get())[1]?.enabled).toBe(false);
    await reorderBookmarkRules(['c', 'a', 'b']);
    expect(await ids()).toEqual(['c', 'a', 'b']);
    const [, deleted] = await bookmarkRulesValue.get();
    await deleteBookmarkRule('a');
    expect(await ids()).toEqual(['c', 'b']);
    await restoreBookmarkRule(deleted as BookmarkRule, 1);
    expect(await ids()).toEqual(['c', 'a', 'b']);
    // Restoring again changes nothing: the rule is already there.
    await restoreBookmarkRule(deleted as BookmarkRule, 0);
    expect(await ids()).toEqual(['c', 'a', 'b']);
  });

  it('gives each new rule its own id', () => {
    expect(createBookmarkRuleId()).not.toBe(createBookmarkRuleId());
  });
});
