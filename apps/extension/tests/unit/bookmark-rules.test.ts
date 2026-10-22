import { describe, expect, it } from 'vitest';
import type { StoredBookmarkMetadataById } from '@/lib/bookmark-metadata-storage';
import {
  BOOKMARK_RULE_TEMPLATES,
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

  it('compares punycode and Unicode domains in one form, whatever the case (R03)', () => {
    const idnTree: BookmarkTreeNode[] = [
      {
        id: '0',
        title: '',
        children: [
          {
            id: '1',
            parentId: '0',
            title: 'Bookmarks bar',
            children: [
              link('root', '1', 'Bücher', 'https://xn--bcher-kva.example/'),
              link('shop', '1', 'Shop', 'https://SHOP.BÜCHER.example/cart'),
              link('lookalike', '1', 'Not it', 'https://notbücher.example/'),
              link('suffix', '1', 'Not it either', 'https://bücher.example.evil.test/'),
              link('broken', '1', 'Broken', 'http://exa mple.com/'),
            ],
          },
        ],
      },
    ];
    for (const query of [
      'domain:bücher.example',
      'domain:xn--bcher-kva.example',
      'domain:BÜCHER.Example',
    ]) {
      const items = planBookmarkRules([rule({ query, addTags: ['books'] })], idnTree, {});
      expect(ids(items), query).toEqual(['root', 'shop']);
    }
    const subdomain = planBookmarkRules(
      [rule({ query: 'domain:shop.xn--bcher-kva.example', addTags: ['books'] })],
      idnTree,
      {},
    );
    expect(ids(subdomain)).toEqual(['shop']);
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

describe('runs that settle (R33)', () => {
  /** Inbox and Archive, with one bookmark in Inbox, and its tree after moving it. */
  const library = (parentId: 'inbox' | 'archive' | 'later'): BookmarkTreeNode[] => {
    const folder = (id: string, title: string): BookmarkTreeNode => ({
      id,
      parentId: '1',
      title,
      children: id === parentId ? [link('x', id, 'Old notes', 'https://notes.example/x')] : [],
    });
    return [
      {
        id: '0',
        title: '',
        children: [
          {
            id: '1',
            parentId: '0',
            title: 'Bookmarks bar',
            children: [
              folder('inbox', 'Inbox'),
              folder('archive', 'Archive'),
              folder('later', 'Later'),
            ],
          },
        ],
      },
    ];
  };
  const runOn = (rules: BookmarkRule[], parentId: 'inbox' | 'archive' | 'later') =>
    planBookmarkRules(rules, library(parentId), {}).find((item) => item.id === 'x');

  it('moves a bookmark once, never back and forth between two rules, in either order', () => {
    // A: notes go to Archive. B: what is in Archive goes back to Inbox.
    const toArchive = rule({
      query: 'title:notes',
      moveTo: { folderId: 'archive', path: 'Archive' },
    });
    const backToInbox = rule({
      query: 'folder:Archive',
      moveTo: { folderId: 'inbox', path: 'Inbox' },
    });
    for (const rules of [
      [toArchive, backToInbox],
      [backToInbox, toArchive],
    ]) {
      // From Inbox, only A matches: it moves to Archive.
      expect(runOn(rules, 'inbox')?.move?.folderId).toBe('archive');
      // In Archive, A still names Archive, so B's Inbox is a conflict, not a move back.
      const there = runOn(rules, 'archive');
      expect(there?.move).toBeUndefined();
      expect(there?.blocked).toBeUndefined();
      expect(there?.conflicts.map((move) => move.folderId)).toEqual(['inbox']);
    }
  });

  it('never moves a bookmark around a ring of rules', () => {
    const rules = [
      rule({ query: 'folder:Inbox', moveTo: { folderId: 'archive', path: 'Archive' } }),
      rule({ query: 'folder:Archive', moveTo: { folderId: 'later', path: 'Later' } }),
      rule({ query: 'folder:Later', moveTo: { folderId: 'inbox', path: 'Inbox' } }),
    ];
    for (const parentId of ['inbox', 'archive', 'later'] as const) {
      expect(runOn(rules, parentId)).toMatchObject({ blocked: 'unstable' });
      expect(runOn(rules, parentId)?.move).toBeUndefined();
    }
  });

  it('moves where the result is stable, and a second run then changes nothing', () => {
    const rules = [
      rule({ query: 'title:notes', moveTo: { folderId: 'archive', path: 'Archive' } }),
      // Reads the tag the first rule adds: moving with it must still settle.
      rule({ query: 'title:notes', addTags: ['old'] }),
      rule({ query: 'tag:old -folder:Archive', moveTo: { folderId: 'later', path: 'Later' } }),
    ];
    const first = runOn(rules, 'inbox');
    expect(first?.move?.folderId).toBe('archive');
    expect(first?.addTags).toEqual(['old']);
    const second = planBookmarkRules(rules, library('archive'), { x: { tags: ['old'] } }).find(
      (item) => item.id === 'x',
    );
    expect(second && changesBookmark(second)).toBe(false);
  });
});

describe('bookmarks with the same address (R37)', () => {
  it('plans each by its own id, folder, and tags', () => {
    const twins: BookmarkTreeNode[] = [
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
                children: [link('w', 'work', 'Docs', 'https://docs.example/')],
              },
              {
                id: 'home',
                parentId: '1',
                title: 'Home',
                children: [link('h', 'home', 'Docs', 'https://docs.example/')],
              },
            ],
          },
        ],
      },
    ];
    const items = planBookmarkRules(
      [
        rule({ query: 'folder:Work', addTags: ['job'] }),
        rule({ query: 'docs -tag:read', addTags: ['unread'] }),
      ],
      twins,
      { h: { tags: ['read'] } },
    );
    expect(items.map(({ id, addTags }) => ({ id, addTags }))).toEqual([
      { id: 'w', addTags: ['job', 'unread'] },
    ]);
  });
});

describe('templates (R19)', () => {
  it('offers a folder move that names no folder, next to the tagging ones', () => {
    expect(BOOKMARK_RULE_TEMPLATES.map((template) => template.id)).toEqual([
      'github',
      'youtube',
      'tutorial',
      'reading',
    ]);
    const reading = BOOKMARK_RULE_TEMPLATES.find((template) => template.id === 'reading');
    expect(reading).toMatchObject({ move: true, add_tags: [] });
    // Its search reads the folder path, not the address.
    const items = plan([
      rule({ query: reading?.query ?? '', moveTo: { folderId: 'library', path: 'Library' } }),
    ]);
    expect(items).toEqual([]);
    expect(ids(plan([rule({ query: 'folder:"Work / Docs"', addTags: ['a'] })]))).toEqual(['d1']);
  });
});
