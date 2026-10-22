import { beforeEach, describe, expect, it } from 'vitest';
import { type BookmarkRule, MAX_BOOKMARK_RULES, parseBookmarkRules } from '@/lib/bookmark-rules';
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

  it('duplicates a rule as a new one and edits the copy alone, across a reload (R18)', async () => {
    await saveBookmarkRule(rule('a', { moveTo: { folderId: 'f1', path: 'Work' } }));
    const [original] = await bookmarkRulesValue.get();
    // Duplicate: the editor saves the copy under a new id, with its own name.
    const copyId = createBookmarkRuleId();
    await saveBookmarkRule({ ...(original as BookmarkRule), id: copyId, name: 'Rule a (copy)' });
    // Edit the copy: another search and folder, turned off.
    await saveBookmarkRule({
      ...(original as BookmarkRule),
      id: copyId,
      name: 'Rule a (copy)',
      query: 'domain:example.com',
      moveTo: { folderId: 'f2', path: 'Home' },
      enabled: false,
    });
    // Read back as the stored, validated list another page would read.
    const stored = parseBookmarkRules(structuredClone(await bookmarkRulesValue.get()));
    expect(
      stored.map(({ id, name, query, enabled, moveTo }) => ({ id, name, query, enabled, moveTo })),
    ).toEqual([
      {
        id: 'a',
        name: 'Rule a',
        query: 'title:a',
        enabled: true,
        moveTo: { folderId: 'f1', path: 'Work' },
      },
      {
        id: copyId,
        name: 'Rule a (copy)',
        query: 'domain:example.com',
        enabled: false,
        moveTo: { folderId: 'f2', path: 'Home' },
      },
    ]);
    expect(stored.every((entry) => entry.syntaxVersion === SEARCH_SYNTAX_VERSION)).toBe(true);
  });

  it('gives each new rule its own id', () => {
    expect(createBookmarkRuleId()).not.toBe(createBookmarkRuleId());
  });
});
