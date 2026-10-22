import { describe, expect, it } from 'vitest';
import { buildSearchDocuments, type SearchDocument, searchDocuments } from '@/lib/search-documents';
import {
  hasSearchOperators,
  parseSearchQuery,
  SEARCH_SYNTAX_VERSION,
  type SearchNode,
  searchQueryTerms,
  serializeSearchQuery,
  upgradeSearchText,
} from '@/lib/search-query';
import type { BookmarkTreeNode } from '@/types';
import { readConfigToml } from '../config-files';

/** A tree with the root and one browser folder, as the browser returns it. */
function tree(children: BookmarkTreeNode[]): BookmarkTreeNode[] {
  return [
    {
      id: '0',
      title: '',
      children: [{ id: '1', parentId: '0', title: 'Bookmarks bar', children }],
    },
  ];
}

const bookmark = (
  id: string,
  title: string,
  url: string,
  extra: Partial<BookmarkTreeNode> = {},
) => ({
  id,
  parentId: 'f',
  title,
  url,
  ...extra,
});

/** The ids a query finds, best first. */
function find(query: string, documents: readonly SearchDocument[]): string[] {
  return searchDocuments(documents, parseSearchQuery(query).query).map(
    (result) => result.document.id,
  );
}

const library = buildSearchDocuments(
  tree([
    {
      id: 'work',
      parentId: '1',
      title: 'Work',
      children: [
        {
          id: 'ai',
          parentId: 'work',
          title: 'AI',
          children: [
            {
              id: 'tools',
              parentId: 'ai',
              title: 'Tools',
              children: [bookmark('hooks', 'React Hooks', 'https://react.dev/hooks')],
            },
          ],
        },
        bookmark('ts', 'Handbook', 'https://www.typescriptlang.org/docs'),
        bookmark('design', 'System design primer', 'https://github.com/donnemartin/system-design'),
        bookmark('split', 'System notes on design', 'https://example.org/notes'),
        bookmark('gateway', 'Infra', 'https://infra.example.net/'),
        bookmark('evil', 'Lookalike', 'https://notexample.com/'),
        bookmark('docs', 'Docs', 'https://docs.example.com/start'),
        bookmark('root-site', 'Example', 'https://example.com/'),
        bookmark('old', 'Old', 'https://old.test/', {
          dateAdded: new Date(2026, 0, 31, 23, 59).getTime(),
        }),
        bookmark('new', 'New', 'https://new.test/', {
          dateAdded: new Date(2026, 1, 1, 0, 0).getTime(),
        }),
      ],
    },
  ]),
  {
    hooks: { tags: ['Research'] },
    gateway: { summary: 'An agent gateway for tools' },
    docs: { tags: ['work', 'archive'] },
    'root-site': { tags: ['work'] },
  },
);

describe('the search query language', () => {
  it('finds by title, address, tag, summary, and folder, with the reason (U01-U05)', () => {
    expect(find('react', library)).toEqual(['hooks']);
    expect(find('typescript', library)).toEqual(['ts']);
    expect(find('tag:research', library)).toEqual(['hooks']);
    // Width and case variants of a tag find it, the way tags are stored.
    expect(find('tag:ＲＥＳＥＡＲＣＨ', library)).toEqual(['hooks']);
    expect(find('gateway', library)).toEqual(['gateway']);
    const [summary] = searchDocuments(library, parseSearchQuery('gateway').query);
    expect(summary?.reasons.map((reason) => reason.field)).toEqual(['summary']);
    // A folder by its path, and everything inside it at any depth.
    expect(find('folder:"Work / AI"', library)).toEqual(['tools', 'hooks']);
    expect(find('path:tools', library)).toEqual(['hooks']);
  });

  it('keeps a phrase together, and plain words apart but all required (U06, U07)', () => {
    expect(find('title:"system design"', library)).toEqual(['design']);
    expect(find('system design', library).sort()).toEqual(['design', 'split']);
    expect(find('react typescript', library)).toEqual([]);
  });

  it('excludes, and finds untagged bookmarks only (U08, U09)', () => {
    expect(find('tag:work -tag:archive', library)).toEqual(['root-site']);
    const untagged = find('is:untagged', library);
    expect(untagged).not.toContain('hooks');
    expect(untagged).not.toContain('work');
    expect(untagged).toContain('ts');
  });

  it('matches a site by whole labels, subdomains included (U10, U11)', () => {
    expect(find('domain:example.com', library).sort()).toEqual(['docs', 'root-site']);
    expect(find('domain:www.typescriptlang.org', library)).toEqual(['ts']);
    expect(find('domain:EXAMPLE.COM', library)).toContain('docs');
  });

  it('reads addresses and unknown operators as text, and says so (U12, U13)', () => {
    expect(parseSearchQuery('https://host/x:y').query.terms).toEqual([
      { kind: 'text', value: 'https://host/x:y', phrase: false, negate: false },
    ]);
    expect(parseSearchQuery('url:https://host/x:y').query.terms[0]).toMatchObject({
      field: 'url',
      value: 'https://host/x:y',
    });
    const unknown = parseSearchQuery('foo:bar');
    expect(unknown.query.terms[0]).toMatchObject({ kind: 'text', value: 'foo:bar' });
    expect(unknown.diagnostics).toEqual([{ code: 'unknown-operator', operator: 'foo' }]);
    const unclosed = parseSearchQuery('title:"system design');
    expect(unclosed.query.terms[0]).toMatchObject({ field: 'title', value: 'system design' });
    expect(unclosed.diagnostics).toEqual([{ code: 'unclosed-quote' }]);
    expect(parseSearchQuery('is:starred').diagnostics).toEqual([
      { code: 'unknown-value', operator: 'is', value: 'starred' },
    ]);
  });

  it('takes local days, both ends inclusive, and reports a day that does not exist (U14)', () => {
    expect(find('after:2026-02-01', library)).toEqual(['new']);
    expect(find('before:2026-01-31', library)).toEqual(['old']);
    expect(find('after:2026-01-31 before:2026-01-31', library)).toEqual(['old']);
    const invalid = parseSearchQuery('after:2026-02-30 react');
    expect(invalid.diagnostics).toEqual([{ code: 'invalid-date', value: '2026-02-30' }]);
    // The rest of the query still searches.
    expect(searchDocuments(library, invalid.query).map((result) => result.document.id)).toEqual([
      'hooks',
    ]);
  });

  it('highlights CJK, emoji, accents, and longer lowercases at their real offsets (U15)', () => {
    const titles = ['日本語のメモ', '🎉 Party plan', 'Café notes', 'İstanbul trip'];
    const documents = buildSearchDocuments(
      tree(titles.map((title, index) => bookmark(`t${index}`, title, `https://t${index}.test/`))),
      {},
    );
    const highlight = (query: string) => {
      const [result] = searchDocuments(documents, parseSearchQuery(query).query);
      const title = result?.document.title ?? '';
      return result?.reasons
        .filter((reason) => reason.field === 'title')
        .flatMap((reason) => reason.ranges.map(([start, end]) => title.slice(start, end)));
    };
    expect(highlight('メモ')).toEqual(['メモ']);
    expect(highlight('party')).toEqual(['Party']);
    expect(highlight('café')).toEqual(['Café']);
    // `İ` lowercases to two code units; the highlight still covers the original letters.
    expect(highlight('i̇stanbul')).toEqual(['İstanbul']);
  });

  it('keeps C++, a GUID, IPv6, percent-encoding, and #tag as text (U16)', () => {
    for (const text of [
      'C++',
      '0f8fad5b-d9cb-469f-a165-70867728950e',
      '[2001:db8::1]',
      'caf%C3%A9',
      '#tag',
      '10:30',
    ]) {
      expect(parseSearchQuery(text)).toEqual({
        query: {
          syntaxVersion: SEARCH_SYNTAX_VERSION,
          terms: [{ kind: 'text', value: text, phrase: false, negate: false }],
        },
        diagnostics: [],
      });
    }
  });

  it('never makes the browser folders results, and keeps the library order without a query (U20)', () => {
    expect(library.some((document) => ['0', '1'].includes(document.id))).toBe(false);
    expect(find('bookmarks bar', library)).toEqual([]);
    expect(find('', library)).toEqual(library.map((document) => document.id));
  });

  it('keeps the same address in two folders as two results with their own tags (U23)', () => {
    const documents = buildSearchDocuments(
      tree([
        {
          id: 'a',
          parentId: '1',
          title: 'A',
          children: [bookmark('a1', 'Same', 'https://same.test/')],
        },
        {
          id: 'b',
          parentId: '1',
          title: 'B',
          children: [bookmark('b1', 'Same', 'https://same.test/')],
        },
      ]),
      { a1: { tags: ['alpha'] }, b1: { tags: ['beta'] } },
    );
    expect(find('same.test', documents).sort()).toEqual(['a1', 'b1']);
    expect(find('tag:beta', documents)).toEqual(['b1']);
  });

  it('ranks an exact title above a summary match (relevance fixture)', () => {
    const documents = buildSearchDocuments(
      tree([
        bookmark('summary-only', 'Notes', 'https://a.test/'),
        bookmark('exact', 'Gateway', 'https://b.test/'),
      ]),
      { 'summary-only': { summary: 'about the gateway' } },
    );
    expect(find('gateway', documents)).toEqual(['exact', 'summary-only']);
  });

  it('reuses the documents of nodes a tree update kept, and rebuilds what changed', () => {
    const kept = bookmark('kept', 'Kept', 'https://kept.test/');
    const tagged = bookmark('tagged', 'Tagged', 'https://tagged.test/');
    const folder = { id: 'f', parentId: '1', title: 'Folder', children: [kept, tagged] };
    const metadata = { tagged: { tags: ['one'] } };
    const before = buildSearchDocuments(tree([folder]), metadata);

    const renamed = { ...folder, children: [kept, tagged] };
    const same = buildSearchDocuments(tree([renamed]), metadata);
    expect(same[1]).toBe(before[1]);
    expect(same[2]).toBe(before[2]);

    const retagged = buildSearchDocuments(tree([renamed]), { tagged: { tags: ['two'] } });
    expect(retagged[1]).toBe(before[1]);
    expect(retagged[2]?.tags).toEqual(['two']);

    const moved = buildSearchDocuments(
      tree([{ ...folder, title: 'Renamed', children: [kept, tagged] }]),
      metadata,
    );
    expect(moved[1]?.folderPath).toBe('Renamed');
    expect(find('folder:renamed', moved)).toEqual(['kept', 'tagged']);
  });

  it('keeps markup in titles as text (U36)', () => {
    const title = '<img src=x onerror=alert(1)>';
    const documents = buildSearchDocuments(tree([bookmark('x', title, 'https://x.test/')]), {});
    const [result] = searchDocuments(documents, parseSearchQuery('onerror').query);
    expect(result?.document.title).toBe(title);
    const at = title.indexOf('onerror');
    expect(result?.reasons[0]?.ranges).toEqual([[at, at + 'onerror'.length]]);
  });

  it('writes back what it read, and survives malformed input (round trip, fuzz)', () => {
    const queries = [
      'react',
      '"system design" -tag:archive',
      'title:"React Hooks" domain:github.com',
      'folder:"Work / AI" tag:"read later"',
      'is:untagged after:2026-01-01 -has:summary',
      '-"exact phrase"',
    ];
    for (const text of queries) {
      const { query } = parseSearchQuery(text);
      expect(parseSearchQuery(serializeSearchQuery(query)).query).toEqual(query);
    }
    const lone = String.fromCharCode(0xd800);
    for (const text of [
      lone,
      `"${lone}`,
      '-',
      '--',
      ':',
      'tag:',
      '"',
      '""',
      'a'.repeat(10_000),
      '\u0000:x',
    ]) {
      expect(() => searchDocuments(library, parseSearchQuery(text).query)).not.toThrow();
    }
    expect(parseSearchQuery('a'.repeat(10_000)).diagnostics[0]?.code).toBe('too-long');
    expect(
      parseSearchQuery(Array.from({ length: 300 }, (_, index) => `w${index}`).join(' '))
        .diagnostics,
    ).toContainEqual(expect.objectContaining({ code: 'too-many-terms' }));
  });
});

/** The configured limit, as `config/bookmarks/search.toml` writes it. */
const limit = (name: string) =>
  (readConfigToml('bookmarks/search.toml')[name] as { value: number }).value;

const word = (value: string, negate = false): SearchNode => ({
  kind: 'text',
  value,
  phrase: false,
  negate,
});

/** Codes of a query's problems, in order. */
const problems = (query: string) =>
  parseSearchQuery(query).diagnostics.map((diagnostic) => diagnostic.code);

describe('OR and parentheses (R07)', () => {
  const tagged = buildSearchDocuments(
    tree([
      bookmark('react', 'React docs', 'https://github.com/facebook/react'),
      bookmark('vue', 'Vue docs', 'https://github.com/vuejs/core'),
      bookmark('old-vue', 'Vue 2', 'https://github.com/vuejs/vue'),
      bookmark('svelte', 'Svelte', 'https://github.com/sveltejs/svelte'),
      bookmark('react-site', 'React site', 'https://react.dev/'),
      bookmark('orbit', 'Orbit for cats', 'https://orbit.test/'),
    ]),
    {
      react: { tags: ['react'] },
      vue: { tags: ['vue'] },
      'old-vue': { tags: ['vue', 'archived'] },
      svelte: { tags: ['svelte'] },
      'react-site': { tags: ['react'] },
    },
  );

  it('reads OR between terms, binding closer than the space', () => {
    expect(parseSearchQuery('a OR b c').query.terms).toEqual([
      { kind: 'any', branches: [word('a'), word('b')], negate: false },
      word('c'),
    ]);
    expect(parseSearchQuery('a b OR c OR -d').query.terms).toEqual([
      word('a'),
      { kind: 'any', branches: [word('b'), word('c'), word('d', true)], negate: false },
    ]);
    expect(find('tag:react OR tag:vue', tagged)).toEqual(['react', 'vue', 'old-vue', 'react-site']);
    expect(find('domain:github.com tag:react OR tag:vue', tagged)).toEqual([
      'react',
      'vue',
      'old-vue',
    ]);
  });

  it('groups with parentheses, nests them, and excludes a group with -( )', () => {
    expect(find('domain:github.com (tag:react OR tag:vue) -tag:archived', tagged)).toEqual([
      'react',
      'vue',
    ]);
    expect(find('-(tag:react OR tag:vue)', tagged)).toEqual(['svelte', 'orbit']);
    expect(find('(domain:react.dev OR (tag:vue -tag:archived))', tagged)).toEqual([
      'vue',
      'react-site',
    ]);
    // A group of one term is the term; two exclusions cancel out.
    expect(parseSearchQuery('(a)').query.terms).toEqual([word('a')]);
    expect(parseSearchQuery('-(-a)').query.terms).toEqual([word('a')]);
    expect(parseSearchQuery('-(a b)').query.terms).toEqual([
      { kind: 'all', nodes: [word('a'), word('b')], negate: true },
    ]);
    expect(parseSearchQuery('( a OR b ) c').query.terms).toEqual(
      parseSearchQuery('(a OR b) c').query.terms,
    );
  });

  it('keeps a lowercase or, quoted OR and parentheses, and parentheses inside a word as text', () => {
    expect(parseSearchQuery('cats or dogs').query.terms).toEqual([
      word('cats'),
      word('or'),
      word('dogs'),
    ]);
    expect(find('cats or', tagged)).toEqual(['orbit']);
    expect(parseSearchQuery('"OR" "(draft)"').query.terms).toEqual([
      { kind: 'text', value: 'OR', phrase: true, negate: false },
      { kind: 'text', value: '(draft)', phrase: true, negate: false },
    ]);
    for (const text of ['f(x)', 'wiki/Foo_(bar)', 'a)b', 'title:(draft)', 'C++(1)']) {
      const parsed = parseSearchQuery(text);
      expect(parsed.diagnostics).toEqual([]);
      expect(parsed.query.terms).toHaveLength(1);
      expect(parsed.query.terms[0]).toMatchObject({ kind: 'text' });
    }
    // A word that ends a group keeps its own parentheses.
    expect(parseSearchQuery('(f(x))').query.terms).toEqual([word('f(x)')]);
  });

  it('reports unbalanced and empty parentheses and a misplaced OR, never throwing', () => {
    expect(problems('(a OR b')).toEqual(['unclosed-group']);
    expect(parseSearchQuery('(a OR b').query.terms).toEqual([
      { kind: 'any', branches: [word('a'), word('b')], negate: false },
    ]);
    expect(problems('a OR b)')).toEqual(['unopened-group']);
    expect(problems('a ()')).toEqual(['empty-group']);
    expect(problems('(')).toEqual(['unclosed-group']);
    expect(problems(')')).toEqual(['unopened-group']);
    expect(problems('OR a')).toEqual(['misplaced-or']);
    expect(problems('a OR')).toEqual(['misplaced-or']);
    expect(problems('a OR OR b')).toEqual(['misplaced-or']);
    expect(problems('(a OR)')).toEqual(['misplaced-or']);
    expect(parseSearchQuery('a OR OR b').query.terms).toEqual([
      { kind: 'any', branches: [word('a'), word('b')], negate: false },
    ]);
    // A term left out says why on its own: no second note for the OR or the group.
    expect(problems('after:2026-02-30 OR a')).toEqual(['invalid-date']);
    expect(problems('(is:nothing)')).toEqual(['unknown-value']);
    for (const text of ['((((', '))))', 'OR OR OR', '-(', '(-)', '(")")', ') OR (']) {
      expect(() => searchDocuments(tagged, parseSearchQuery(text).query)).not.toThrow();
    }
  });

  it('stops reading at the configured nesting depth and OR width, and says so', () => {
    const depth = limit('max_group_depth');
    const nested = (levels: number) => `${'('.repeat(levels)}a${')'.repeat(levels)}`;
    expect(problems(nested(depth))).toEqual([]);
    const deep = parseSearchQuery(`b ${nested(depth + 1)} c`);
    expect(deep.diagnostics).toEqual([{ code: 'too-deep', limit: depth }]);
    // What came before the limit stays; the rest is not searched.
    expect(deep.query.terms).toEqual([word('b')]);

    const branches = limit('max_or_branches');
    const alternatives = (count: number) =>
      Array.from({ length: count }, (_, index) => `w${index}`).join(' OR ');
    expect(problems(alternatives(branches))).toEqual([]);
    const wide = parseSearchQuery(`${alternatives(branches + 1)} z`);
    expect(wide.diagnostics).toEqual([{ code: 'too-many-branches', limit: branches }]);
    expect(wide.query.terms).toEqual([
      {
        kind: 'any',
        branches: Array.from({ length: branches }, (_, index) => word(`w${index}`)),
        negate: false,
      },
    ]);

    // Terms count across groups and alternatives alike.
    const terms = limit('max_terms');
    const grouped = Array.from({ length: terms + 1 }, (_, index) => `(t${index})`).join(' ');
    expect(problems(grouped)).toEqual(['too-many-terms']);
  });

  it('reports a term only for the OR branch that matched, and highlights each match', () => {
    const [result] = searchDocuments(tagged, parseSearchQuery('svelte OR vue').query);
    expect(result?.document.id).toBe('svelte');
    // Every branch counts toward the rank, and only matching ones give reasons.
    expect(result?.reasons.map((reason) => reason.field).sort()).toEqual(['tag', 'title', 'url']);
    expect(JSON.stringify(result?.reasons)).not.toContain('vue');
    const [both] = searchDocuments(tagged, parseSearchQuery('react OR docs').query);
    expect(both?.document.id).toBe('react');
    const title = both?.reasons.find((reason) => reason.field === 'title');
    expect(title?.ranges).toEqual([
      [0, 5],
      [6, 10],
    ]);
    // An excluded group gives no reasons.
    const [excluded] = searchDocuments(tagged, parseSearchQuery('svelte -(vue OR react)').query);
    expect(excluded?.reasons.every((reason) => !JSON.stringify(reason).includes('vue'))).toBe(true);
  });

  it('matches the same way on every run, and ranks documents matching more branches higher', () => {
    const query = parseSearchQuery('(react OR vue OR docs) -tag:archived').query;
    const first = searchDocuments(tagged, query).map((result) => result.document.id);
    expect(first).toEqual(['react', 'vue', 'react-site']);
    for (let run = 0; run < 3; run += 1) {
      expect(searchDocuments(tagged, query).map((result) => result.document.id)).toEqual(first);
    }
  });

  it('writes groups and alternatives back so they read the same', () => {
    for (const text of [
      'a OR b c',
      'domain:github.com (tag:react OR tag:vue) -tag:archived',
      '-(a OR b) (c d) -(e f)',
      '(a OR b) OR c',
      '(a (b OR (c -d)))',
      '"OR" or "(x)" f(x)',
    ]) {
      const { query } = parseSearchQuery(text);
      expect(parseSearchQuery(serializeSearchQuery(query)).query).toEqual(query);
    }
    expect(serializeSearchQuery(parseSearchQuery('(a OR b) OR c').query)).toBe('(a OR b) OR c');
  });

  it('reads version 1 without OR or parentheses, and upgrades its text to read the same', () => {
    expect(parseSearchQuery('cats OR (dogs)', 1).query).toEqual({
      syntaxVersion: 1,
      terms: [word('cats'), word('OR'), word('(dogs)')],
    });
    // Text that reads the same in both versions is kept as typed.
    expect(upgradeSearchText('domain:github.com -tag:old f(x)', 1)).toBe(
      'domain:github.com -tag:old f(x)',
    );
    expect(upgradeSearchText('a OR b', SEARCH_SYNTAX_VERSION)).toBe('a OR b');
    for (const text of ['cats OR dogs', '(draft) -(old', 'title:x) y', '-( OR )']) {
      const upgraded = upgradeSearchText(text, 1);
      expect(upgraded).not.toBe(text);
      const before = parseSearchQuery(text, 1);
      const after = parseSearchQuery(upgraded);
      expect(after.diagnostics).toEqual([]);
      expect(searchDocuments(tagged, after.query)).toEqual(searchDocuments(tagged, before.query));
      expect(
        [...searchQueryTerms(after.query.terms)].map(({ term }) => ({ ...term, phrase: false })),
      ).toEqual(
        [...searchQueryTerms(before.query.terms)].map(({ term }) => ({ ...term, phrase: false })),
      );
    }
  });

  it('counts OR and parentheses as operators, so such a query never names a folder to save into', () => {
    expect(hasSearchOperators(parseSearchQuery('soup OR stew').query)).toBe(true);
    expect(hasSearchOperators(parseSearchQuery('(soup stew)').query)).toBe(true);
    expect(hasSearchOperators(parseSearchQuery('soup or stew').query)).toBe(false);
  });

  it('lists every term with whether the groups around it exclude it', () => {
    const terms = [...searchQueryTerms(parseSearchQuery('a -(b -c OR d) e').query.terms)];
    expect(
      terms.map(({ term, excludes }) => [term.kind === 'text' && term.value, excludes]),
    ).toEqual([
      ['a', false],
      ['b', true],
      ['c', false],
      ['d', true],
      ['e', false],
    ]);
  });
});
