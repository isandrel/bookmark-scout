import { describe, expect, it } from 'vitest';
import { findFolderMatches, holdFolderMatchOrder, labelRecentFolders } from '@/lib/folder-match';
import type { BookmarkTreeNode } from '@/types';

type Spec = { [title: string]: Spec };

let nextId = 0;
function build(spec: Spec, parentId: string): BookmarkTreeNode[] {
  return Object.entries(spec).map(([title, children]) => {
    const id = title.toLowerCase().replace(/\W+/g, '-') + `-${nextId++}`;
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

const options = { limit: 5, allowTypos: true };
const paths = (query: string, recent: string[] = [], allowTypos = true) =>
  findFolderMatches(tree, query, { ...options, allowTypos, recentFolderIds: recent }).map((match) =>
    [...match.parents, match.folder.title].join('/'),
  );

describe('findFolderMatches', () => {
  it('lists folders by name with exact names first, then shallower paths', () => {
    expect(paths('hooks')).toEqual([
      'Bookmarks Bar/Reading/Hooks',
      'Bookmarks Bar/Dev/Frontend/React/Hooks',
    ]);
    expect(paths('recipes')).toEqual([
      'Bookmarks Bar/Home/Recipes',
      'Bookmarks Bar/Dev/Recipes App',
    ]);
  });

  it('matches earlier words against parents, separated by spaces or slashes', () => {
    expect(paths('react hooks')).toEqual(['Bookmarks Bar/Dev/Frontend/React/Hooks']);
    expect(paths('frontend/react')).toEqual(['Bookmarks Bar/Dev/Frontend/React']);
    expect(paths('dev > css')).toEqual(['Bookmarks Bar/Dev/Frontend/CSS']);
  });

  it('accepts one typo in longer words only', () => {
    expect(paths('rect')).toEqual(['Bookmarks Bar/Dev/Frontend/React']);
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
