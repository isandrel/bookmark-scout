import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setLanguage } from '@/hooks/use-i18n';
import {
  countRuleMatches,
  describeRule,
  EMPTY_RULE_DRAFT,
  isRuleQueryReadable,
  ruleDraftOf,
  ruleFolderPath,
  ruleFromDraft,
} from '@/lib/bookmark-rule-draft';
import type { BookmarkTreeNode } from '@/types';

const tree: BookmarkTreeNode[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        parentId: '0',
        title: 'Bookmarks bar',
        children: [
          { id: 'dev', parentId: '1', title: 'Dev', children: [] },
          { id: 'a', parentId: '1', title: 'Repo', url: 'https://github.com/acme/repo' },
          { id: 'b', parentId: '1', title: 'News', url: 'https://news.example.com/' },
        ],
      },
    ],
  },
];

const draft = {
  ...EMPTY_RULE_DRAFT,
  name: 'GitHub',
  query: 'domain:github.com',
  tags: 'dev, code',
};

describe('smart rule drafts', () => {
  beforeAll(() => setLanguage('en'));
  afterAll(() => setLanguage('auto'));

  it('saves a draft as a rule with its tags and the folder path read from the tree', () => {
    const result = ruleFromDraft({ ...draft, folderId: 'dev' }, 'new-id', tree);
    expect(result).toMatchObject({
      rule: {
        id: 'new-id',
        name: 'GitHub',
        addTags: ['dev', 'code'],
        moveTo: { folderId: 'dev' },
      },
    });
    if (!('rule' in result)) throw new Error('not saved');
    expect(result.rule.moveTo?.path).toBe(ruleFolderPath(tree, 'dev'));
    expect(ruleDraftOf(result.rule)).toEqual({ ...draft, id: 'new-id', folderId: 'dev' });
    expect(describeRule(result.rule)).toMatch(
      /^domain:github\.com: add tags dev and code · move to /,
    );
  });

  it('says why a draft cannot be saved, name first', () => {
    expect(ruleFromDraft({ ...draft, name: ' ' }, 'x', tree)).toEqual({ error: 'name' });
    expect(ruleFromDraft({ ...draft, query: ' ' }, 'x', tree)).toEqual({ error: 'query' });
    expect(ruleFromDraft({ ...draft, tags: '' }, 'x', tree)).toEqual({ error: 'action' });
  });

  it('reads a search only when it asks for something without problems', () => {
    expect(isRuleQueryReadable('domain:github.com')).toBe(true);
    expect(isRuleQueryReadable('')).toBe(false);
    expect(isRuleQueryReadable('frobnicate:x')).toBe(false);
  });

  it('counts the bookmarks a search finds now', () => {
    expect(countRuleMatches('domain:github.com', tree, {})).toBe(1);
    expect(countRuleMatches('domain:nowhere.example', tree, {})).toBe(0);
    expect(countRuleMatches('domain:github.com OR domain:example.com', tree, {})).toBe(2);
    expect(countRuleMatches('-(domain:github.com OR title:news)', tree, {})).toBe(0);
  });

  it('saves and describes a rule with OR, and refuses unbalanced parentheses (R07)', () => {
    const query = '(domain:github.com OR domain:example.com) -title:news';
    const result = ruleFromDraft({ ...draft, query }, 'or-id', tree);
    if (!('rule' in result)) throw new Error('not saved');
    expect(result.rule.query).toBe(query);
    expect(describeRule(result.rule)).toBe(`${query}: add tags dev and code`);
    expect(isRuleQueryReadable('(domain:github.com OR tag:x')).toBe(false);
    expect(ruleFromDraft({ ...draft, query: 'a OR' }, 'x', tree)).toEqual({ error: 'query' });
  });
});
