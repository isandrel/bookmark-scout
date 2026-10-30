import { describe, expect, it } from 'vitest';
import { findFolderMatches, holdFolderMatchOrder, labelRecentFolders } from '@/lib/folder-match';
import { defaultSettings } from '@/lib/settings-schema';
import type { BookmarkTreeNode } from '@/types';

/** Search Matching and the folder weights at their defaults, with the ones given changed. */
function ranking(
  fuzzy = true,
  prefix = true,
  bookmarks = defaultSettings.folderMatchesBookmarkWeight,
) {
  return {
    matching: {
      fuzzy,
      fuzzyOneEdit: defaultSettings.searchFuzzyOneEdit,
      fuzzyTwoEdits: defaultSettings.searchFuzzyTwoEdits,
      prefix,
      k1: defaultSettings.searchBm25K1,
      b: defaultSettings.searchBm25B,
    },
    weights: {
      name: defaultSettings.folderMatchesNameWeight,
      parents: defaultSettings.folderMatchesParentWeight,
      bookmarks,
    },
  };
}

type Spec = { [title: string]: Spec };

let nextId = 0;
function build(spec: Spec, parentId: string): BookmarkTreeNode[] {
  return Object.entries(spec).map(([title, children]) => {
    const id = `${title.toLowerCase().replace(/\W+/g, '-')}-${nextId++}`;
    return {
      id,
      parentId,
      title,
      children: [
        { id: `${id}-link`, parentId: id, title: 'Link', url: 'https://example.com/' },
        ...build(children, id),
      ],
    };
  });
}

const tree: BookmarkTreeNode[] = [
  {
    id: '0',
    title: '',
    children: build(
      {
        'Bookmarks Bar': {
          Dev: { Frontend: { React: { Hooks: {}, Router: {} }, CSS: {} }, 'Recipes App': {} },
          Reading: { Hooks: {} },
          Home: { Recipes: { Pasta: {} } },
          Work: { 'Q4 Launch': {} },
          ÉtÉ: {},
        },
      },
      '0',
    ),
  },
];

const options = { limit: 5, ...ranking() };
const paths = (query: string, recent: string[] = [], fuzzy = true) =>
  findFolderMatches(tree, query, { ...options, ...ranking(fuzzy), recentFolderIds: recent }).map(
    (match) => [...match.parents, match.folder.title].join('/'),
  );

describe('findFolderMatches', () => {
  it('ranks folders named for the words first, then folders inside them, then shallower paths', () => {
    expect(paths('hooks')).toEqual([
      'Bookmarks Bar/Reading/Hooks',
      'Bookmarks Bar/Dev/Frontend/React/Hooks',
    ]);
    expect(paths('recipes')).toEqual([
      'Bookmarks Bar/Home/Recipes',
      'Bookmarks Bar/Dev/Recipes App',
      // A folder inside one, found by its parent's name, ranks below folders named for the word.
      'Bookmarks Bar/Home/Recipes/Pasta',
    ]);
  });

  it('matches earlier words against parents, separated by spaces or slashes', () => {
    expect(paths('react hooks')).toEqual(['Bookmarks Bar/Dev/Frontend/React/Hooks']);
    expect(paths('frontend/react')).toEqual([
      'Bookmarks Bar/Dev/Frontend/React',
      'Bookmarks Bar/Dev/Frontend/React/Hooks',
      'Bookmarks Bar/Dev/Frontend/React/Router',
    ]);
    expect(paths('dev > css')).toEqual(['Bookmarks Bar/Dev/Frontend/CSS']);
  });

  it('matches words with small spelling differences, in longer words only', () => {
    expect(paths('rect')[0]).toBe('Bookmarks Bar/Dev/Frontend/React');
    expect(paths('cs')).toEqual(['Bookmarks Bar/Dev/Frontend/CSS']);
    expect(paths('xss')).toEqual([]);
    expect(paths('rect', [], false)).toEqual([]);
  });

  it('returns at most the configured number of matches', () => {
    expect(findFolderMatches(tree, 'hooks', { ...options, limit: 1 })).toHaveLength(1);
  });

  it('matches word starts inside names and ignores case and width', () => {
    expect(paths('launch')).toEqual(['Bookmarks Bar/Work/Q4 Launch']);
    expect(paths('ＨＯＯＫＳ').length).toBe(2);
    expect(paths('été')).toEqual(['Bookmarks Bar/ÉtÉ']);
  });

  it('ranks recently used folders above equally good matches', () => {
    const deep = findFolderMatches(tree, 'hooks', options).find((match) =>
      match.parents.includes('React'),
    );
    expect(paths('hooks', [deep?.folder.id ?? ''])[0]).toBe(
      'Bookmarks Bar/Dev/Frontend/React/Hooks',
    );
  });

  it('never offers the invisible root and highlights the matched part of the title', () => {
    expect(paths('')).toEqual([]);
    const [match] = findFolderMatches(tree, 'launch', options);
    expect(match.titleRanges).toEqual([[3, 9]]);
  });
});

describe('holdFolderMatchOrder', () => {
  const matches = (query: string, recent: string[] = []) =>
    findFolderMatches(tree, query, { ...options, recentFolderIds: recent });

  it('keeps the shown order when a save makes another folder recent', () => {
    const shown = matches('hooks');
    const reranked = matches('hooks', [shown[1].folder.id]);
    // The ranking itself changes: the folder just saved to moves up.
    expect(reranked[0].folder.id).toBe(shown[1].folder.id);
    expect(holdFolderMatchOrder(shown, reranked).map((match) => match.folder.id)).toEqual(
      shown.map((match) => match.folder.id),
    );
  });

  it('keeps the new objects and puts folders not shown before after the others', () => {
    const shown = matches('hooks').slice(0, 1);
    const next = matches('hooks', [matches('hooks')[1].folder.id]);
    const held = holdFolderMatchOrder(shown, next);
    expect(held[0]).toBe(next.find((match) => match.folder.id === shown[0].folder.id));
    expect(held.map((match) => match.folder.id).sort()).toEqual(
      next.map((match) => match.folder.id).sort(),
    );
  });
});

describe('labelRecentFolders', () => {
  const folder = (id: string, title: string, children: BookmarkTreeNode[] = []) => ({
    id,
    title,
    children,
  });
  // Only the invisible root has no parent.
  const withParents = (node: BookmarkTreeNode, parentId?: string): BookmarkTreeNode => ({
    ...node,
    ...(parentId ? { parentId } : {}),
    children: node.children?.map((child) => withParents(child, node.id)),
  });
  const recentTree: BookmarkTreeNode[] = [
    withParents({
      id: '0',
      title: '',
      children: [
        folder('bar', 'Bookmarks Bar', [
          folder('work', 'Work', [
            folder('work-inbox', 'Inbox'),
            folder('a-proj', 'Projects', [folder('a-inbox', 'Inbox')]),
          ]),
          folder('home', 'Home', [
            folder('home-inbox', 'inbox'),
            folder('b-proj', 'Projects', [folder('b-inbox', 'Inbox')]),
          ]),
          folder('news', 'News'),
        ]),
      ],
    }),
  ];
  const recent = (ids: string[]) => ids.map((id) => ({ id, title: `stored ${id}` }));

  it('names no parents for a title that is unique among the chips', () => {
    const [news, inbox] = labelRecentFolders(recent(['news', 'work-inbox']), recentTree);
    expect(news).toEqual({
      id: 'news',
      title: 'News',
      context: [],
      path: ['Bookmarks Bar', 'News'],
    });
    expect(inbox.context).toEqual([]);
    expect(inbox.path).toEqual(['Bookmarks Bar', 'Work', 'Inbox']);
  });

  it('adds the closest parents that tell folders with the same title apart', () => {
    const labels = labelRecentFolders(
      recent(['work-inbox', 'home-inbox', 'a-inbox', 'b-inbox']),
      recentTree,
    );
    expect(labels.map((label) => [label.title, label.context])).toEqual([
      ['Inbox', ['Work']],
      ['inbox', ['Home']],
      ['Inbox', ['Work', 'Projects']],
      ['Inbox', ['Home', 'Projects']],
    ]);
  });

  it('uses the stored title for a folder the tree does not have yet', () => {
    expect(labelRecentFolders(recent(['gone']), recentTree)).toEqual([
      { id: 'gone', title: 'stored gone', context: [], path: ['stored gone'] },
    ]);
  });
});

describe('findFolderMatches ranking (BM25)', () => {
  const folder = (id: string, title: string, children: BookmarkTreeNode[] = []) => ({
    id,
    parentId: 'bar',
    title,
    children,
  });
  const link = (id: string, title: string, url: string) => ({ id, parentId: '', title, url });
  const library: BookmarkTreeNode[] = [
    {
      id: '0',
      title: '',
      children: [
        {
          id: 'bar',
          parentId: '0',
          title: 'Bookmarks Bar',
          children: [
            folder('kubernetes', 'Kubernetes'),
            folder('infra', 'Infrastructure', [
              link('k1', 'Kubernetes the hard way', 'https://github.com/kelseyhightower/'),
              link('k2', 'Kubernetes docs', 'https://kubernetes.io/docs/'),
            ]),
            folder('cooking', 'Cooking'),
          ],
        },
      ],
    },
  ];
  // These folders are found by the bookmarks in them too, which the defaults leave out.
  const BOOKMARK_WEIGHT = 0.5;
  const titles = (query: string, fuzzy = true) =>
    findFolderMatches(library, query, { limit: 5, ...ranking(fuzzy, true, BOOKMARK_WEIGHT) }).map(
      ({ folder: f }) => f.title,
    );

  it('ranks a folder named for the word above one whose bookmarks mention it', () => {
    expect(titles('kubernetes')).toEqual(['Kubernetes', 'Infrastructure']);
  });

  it('finds a folder by the start of its name while the word is being typed', () => {
    expect(titles('kube')).toEqual(['Kubernetes', 'Infrastructure']);
    expect(titles('infra')).toEqual(['Infrastructure']);
  });

  it('finds words with small spelling differences only with fuzzy matching on', () => {
    expect(titles('kubernets')).toEqual(['Kubernetes', 'Infrastructure']);
    expect(titles('kubernets', false)).toEqual([]);
    // Every word must be found somewhere in the folder.
    expect(titles('kubernetes cooking')).toEqual([]);
  });

  it('matches word starts only with Match Word Starts on, and leaves out a part weighted 0', () => {
    const prefixOff = (query: string) =>
      findFolderMatches(library, query, { limit: 5, ...ranking(true, false, BOOKMARK_WEIGHT) }).map(
        ({ folder: f }) => f.title,
      );
    expect(prefixOff('kube')).toEqual([]);
    expect(prefixOff('kubernetes')).toEqual(['Kubernetes', 'Infrastructure']);
    const namesOnly = { ...ranking(), weights: { name: 4, parents: 1, bookmarks: 0 } };
    expect(
      findFolderMatches(library, 'kubernetes', { limit: 5, ...namesOnly }).map(
        ({ folder: f }) => f.title,
      ),
    ).toEqual(['Kubernetes']);
  });

  it('follows the folder weights and BM25 k1 and b', () => {
    const order = (weights: { name: number; parents: number; bookmarks: number }) =>
      findFolderMatches(library, 'kubernetes', { limit: 5, ...ranking(), weights }).map(
        ({ folder: f }) => f.title,
      );
    // Its bookmarks outweigh a name: the folder whose bookmarks mention the word comes first.
    expect(order({ name: 0.5, parents: 1, bookmarks: 20 })).toEqual([
      'Infrastructure',
      'Kubernetes',
    ]);
    const score = (k1: number, b: number) => {
      const base = ranking(true, true, BOOKMARK_WEIGHT);
      const [match] = findFolderMatches(library, 'kubernetes', {
        limit: 1,
        weights: base.weights,
        matching: { ...base.matching, k1, b },
      });
      return match.score;
    };
    expect(score(0.5, 0.75)).not.toBe(score(2, 0.75));
    expect(score(1.2, 0)).not.toBe(score(1.2, 1));
  });

  it('marks the words found in the title', () => {
    const [match] = findFolderMatches(library, 'kube', {
      limit: 1,
      ...ranking(true, true, BOOKMARK_WEIGHT),
    });
    expect(match.titleRanges).toEqual([[0, 10]]);
  });
});
