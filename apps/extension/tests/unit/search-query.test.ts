import { describe, expect, it } from 'vitest';
import { buildSearchDocuments, type SearchDocument, searchDocuments } from '@/lib/search-documents';
import { parseSearchQuery, serializeSearchQuery } from '@/lib/search-query';
import type { BookmarkTreeNode } from '@/types';

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
          syntaxVersion: 1,
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
