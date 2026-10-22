import { describe, expect, it } from 'vitest';
import type { StoredBookmarkMetadataById } from '@/lib/bookmark-metadata-storage';
import {
  type BookmarkRule,
  changesBookmark,
  MAX_BOOKMARK_RULES,
  parseBookmarkRules,
  planBookmarkRules,
} from '@/lib/bookmark-rules';
import { SEARCH_SYNTAX_VERSION } from '@/lib/search-query';
import type { BookmarkTreeNode } from '@/types';
import { readConfigToml } from '../config-files';

const link = (id: string, parentId: string, title: string, url: string): BookmarkTreeNode => ({
  id,
  parentId,
  title,
  url,
});

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
          {
            id: 'work',
            parentId: '1',
            title: 'Work',
            children: [
              {
                id: 'docs',
                parentId: 'work',
                title: 'Docs',
                children: [link('d1', 'docs', 'API reference', 'https://docs.example.com/api')],
              },
              link('gh', 'work', 'Repo', 'https://github.com/org/repo'),
              link('ghsub', 'work', 'Gist', 'https://GIST.GitHub.com/x'),
            ],
          },
          link('evil', '1', 'Fake', 'https://github.com.evil.net/'),
          link('my', '1', 'Mine', 'https://mygithub.com/'),
          link('tut', '1', 'React Tutorial', 'https://react.dev/learn'),
          {
            id: 'policy',
            parentId: '1',
            title: 'Company',
            unmodifiable: 'managed',
            children: [link('managed', 'policy', 'Intranet tutorial', 'https://intra.example/')],
          },
          { id: 'library', parentId: '1', title: 'Library', children: [] },
        ],
      },
    ],
  },
];

let next = 0;
const rule = (overrides: Partial<BookmarkRule>): BookmarkRule => {
  next += 1;
  return {
    id: `r${next}`,
    name: 'Rule',
    enabled: true,
    query: 'x',
    syntaxVersion: SEARCH_SYNTAX_VERSION,
    addTags: [],
    ...overrides,
  };
};

const plan = (rules: BookmarkRule[], metadata: StoredBookmarkMetadataById = {}) =>
  planBookmarkRules(rules, tree, metadata);
const ids = (items: ReturnType<typeof plan>) => items.map((item) => item.id).sort();

describe('planBookmarkRules', () => {
  it('matches a domain and its subdomains only, whatever the case (R01-R03)', () => {
    const items = plan([rule({ query: 'domain:github.com', addTags: ['development'] })]);
    expect(ids(items)).toEqual(['gh', 'ghsub']);
    expect(items.every((item) => item.addTags[0] === 'development')).toBe(true);
  });

  it('tells the address from the folder path (R04, R05)', () => {
    expect(ids(plan([rule({ query: 'url:/api', addTags: ['a'] })]))).toEqual(['d1']);
    expect(ids(plan([rule({ query: 'folder:"Work / Docs"', addTags: ['a'] })]))).toEqual(['d1']);
    expect(ids(plan([rule({ query: 'folder:Work', addTags: ['a'] })]))).toEqual([
      'd1',
      'gh',
      'ghsub',
    ]);
  });

  it('adds each tag once, keeping the spelling a bookmark already has (R06, R10)', () => {
    const items = plan(
      [
        rule({ query: 'title:tutorial', addTags: ['Learning', 'React'] }),
        rule({ query: 'react', addTags: ['react', 'learning', 'frontend'] }),
      ],
      { tut: { tags: ['REACT'] } },
    );
    const tutorial = items.find((item) => item.id === 'tut');
    expect(tutorial?.addTags).toEqual(['Learning', 'frontend']);
    expect(tutorial?.ruleIds).toHaveLength(2);
  });

  it('lets the first move win and lists the others as conflicts (R09, R11)', () => {
    const first = rule({
      query: 'domain:github.com',
      moveTo: { folderId: 'library', path: 'Library' },
    });
    const second = rule({ query: 'repo', moveTo: { folderId: 'docs', path: 'Work / Docs' } });
    const repo = plan([first, second]).find((item) => item.id === 'gh');
    expect(repo?.move).toEqual({ ruleId: first.id, folderId: 'library', path: 'Library' });
    expect(repo?.conflicts).toEqual([{ ruleId: second.id, folderId: 'docs', path: 'Work / Docs' }]);
    const reversed = plan([second, first]).find((item) => item.id === 'gh');
    expect(reversed?.move?.folderId).toBe('docs');
  });

  it('keeps what already follows the rules, and changes nothing for it', () => {
    const items = plan(
      [
        rule({
          query: 'domain:github.com',
          addTags: ['dev'],
          moveTo: { folderId: 'work', path: 'Work' },
        }),
      ],
      { gh: { tags: ['Dev'] } },
    );
    const repo = items.find((item) => item.id === 'gh');
    expect(repo).toMatchObject({ addTags: [], conflicts: [] });
    expect(repo?.move).toBeUndefined();
    expect(repo && changesBookmark(repo)).toBe(false);
  });

  it('finds the folder of a restored rule by its path when its id is not here, unless two match (R39)', () => {
    const restored = plan([
      rule({
        query: 'repo',
        moveTo: { folderId: 'other-profile', path: 'Bookmarks bar / Library' },
      }),
    ]);
    expect(restored[0]?.move).toMatchObject({
      folderId: 'library',
      path: 'Bookmarks bar / Library',
    });
    const twin: BookmarkTreeNode = {
      id: 'library2',
      parentId: 'work',
      title: 'Library',
      children: [],
    };
    const work = tree[0]?.children?.[0]?.children?.[0];
    work?.children?.push(twin);
    try {
      const ambiguous = plan([
        rule({ query: 'repo', moveTo: { folderId: 'other-profile', path: 'Library' } }),
      ]);
      expect(ambiguous[0]?.blocked).toBe('missingFolder');
    } finally {
      work?.children?.pop();
    }
  });

  it('never moves into a missing or managed folder, or out of a managed one (R13)', () => {
    const missing = plan([rule({ query: 'repo', moveTo: { folderId: 'gone', path: 'Gone' } })]);
    expect(missing[0]).toMatchObject({ id: 'gh', blocked: 'missingFolder' });
    expect(missing[0]?.move).toBeUndefined();
    const into = plan([rule({ query: 'repo', moveTo: { folderId: 'policy', path: 'Company' } })]);
    expect(into[0]?.blocked).toBe('managed');
    const outOf = plan([
      rule({ query: 'intranet', moveTo: { folderId: 'library', path: 'Library' } }),
    ]);
    expect(outOf[0]).toMatchObject({ id: 'managed', blocked: 'managed' });
    const root = plan([rule({ query: 'repo', moveTo: { folderId: '0', path: '' } })]);
    expect(root[0]?.blocked).toBe('missingFolder');
  });

  it('combines terms with AND, OR, and NOT, in groups (R07)', () => {
    const query = '(domain:github.com OR domain:docs.example.com) -title:gist';
    expect(ids(plan([rule({ query, addTags: ['x'] })]))).toEqual(['d1', 'gh']);
    // Rules still read the bookmark as it was: an OR rule and a plain one both match it.
    const items = plan([
      rule({ query: 'tag:read OR title:repo', addTags: ['later'] }),
      rule({ query: '-(tag:read OR domain:example.com) repo', addTags: ['code'] }),
    ]);
    expect(items.find((item) => item.id === 'gh')).toMatchObject({ addTags: ['later', 'code'] });
    expect(ids(items)).toEqual(['gh']);
  });

  it('runs only enabled rules, and never on folders', () => {
    expect(plan([rule({ query: 'repo', addTags: ['x'], enabled: false })])).toEqual([]);
    expect(ids(plan([rule({ query: 'work', addTags: ['x'] })]))).toEqual(['d1', 'gh', 'ghsub']);
  });
});

describe('parseBookmarkRules', () => {
  const valid = rule({ id: 'ok', query: 'tag:read', addTags: ['later'] });

  it('keeps valid rules in order and drops what cannot run (R08, R09)', () => {
    const parsed = parseBookmarkRules([
      valid,
      { ...valid, id: 'second', query: 'domain:a.com' },
      { ...valid, id: 'ok' },
      { ...valid, id: 'noAction', addTags: [] },
      { ...valid, id: 'badQuery', query: 'after:2026-02-30' },
      { ...valid, id: 'unknownOperator', query: 'foo:bar' },
      { ...valid, id: 'empty', query: '  ' },
      { ...valid, id: 'extra', script: 'alert(1)' },
      { ...valid, id: 'oldSyntax', syntaxVersion: 0 },
      'not a rule',
    ]);
    expect(parsed.map((entry) => entry.id)).toEqual(['ok', 'second']);
    expect(parseBookmarkRules({ rules: [valid] })).toEqual([]);
  });

  it('keeps OR rules, and drops one whose search is unbalanced or past the limits (R07)', () => {
    const search = readConfigToml('bookmarks/search.toml') as Record<string, { value: number }>;
    const depth = search.max_group_depth?.value ?? 0;
    const branches = search.max_or_branches?.value ?? 0;
    const parsed = parseBookmarkRules([
      { ...valid, id: 'or', query: 'domain:github.com (tag:react OR tag:vue) -tag:archived' },
      { ...valid, id: 'unclosed', query: '(tag:react OR tag:vue' },
      { ...valid, id: 'unopened', query: 'tag:react)' },
      { ...valid, id: 'dangling', query: 'tag:react OR' },
      { ...valid, id: 'deep', query: `${'('.repeat(depth + 1)}a${')'.repeat(depth + 1)}` },
      {
        ...valid,
        id: 'wide',
        query: Array.from({ length: branches + 1 }, (_, index) => `t${index}`).join(' OR '),
      },
    ]);
    expect(parsed.map((entry) => entry.id)).toEqual(['or']);
  });

  it('keeps a rule saved before OR existed, rewritten to find the same bookmarks (R07)', () => {
    const [old] = parseBookmarkRules([
      { ...valid, id: 'v1', query: 'Repo OR (draft)', syntaxVersion: 1 },
    ]);
    expect(old).toMatchObject({ id: 'v1', query: 'Repo "OR" "(draft)"', syntaxVersion: 2 });
    const [kept] = parseBookmarkRules([
      { ...valid, id: 'v1-same', query: 'domain:github.com', syntaxVersion: 1 },
    ]);
    expect(kept).toMatchObject({
      query: 'domain:github.com',
      syntaxVersion: SEARCH_SYNTAX_VERSION,
    });
  });

  it(`keeps at most ${MAX_BOOKMARK_RULES} rules`, () => {
    const many = Array.from({ length: MAX_BOOKMARK_RULES + 3 }, (_, index) => ({
      ...valid,
      id: `rule-${index}`,
    }));
    expect(parseBookmarkRules(many)).toHaveLength(MAX_BOOKMARK_RULES);
  });
});
