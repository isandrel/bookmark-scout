import { describe, expect, it } from 'vitest';
import { findFolderMatches } from '@/lib/folder-match';
import type { BookmarkTreeNode } from '@/types';

type Spec = { [title: string]: Spec };

let nextId = 0;
function build(spec: Spec, parentId: string): BookmarkTreeNode[] {
  return Object.entries(spec).map(([title, children]) => {
    const id = title.toLowerCase().replace(/\W+/g, '-') + `-${nextId++}`;
    return { id, parentId, title, children: [{ id: `${id}-link`, parentId: id, title: 'Link', url: 'https://example.com/' }, ...build(children, id)] };
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
          'ÉtÉ': {},
        },
      },
      '0',
    ),
  },
];

const options = { limit: 5, allowTypos: true };
const paths = (query: string, recent: string[] = [], allowTypos = true) =>
  findFolderMatches(tree, query, { ...options, allowTypos, recentFolderIds: recent }).map((match) => [...match.parents, match.folder.title].join('/'));

describe('findFolderMatches', () => {
  it('lists folders by name with exact names first, then shallower paths', () => {
    expect(paths('hooks')).toEqual([
      'Bookmarks Bar/Reading/Hooks',
      'Bookmarks Bar/Dev/Frontend/React/Hooks',
    ]);
    expect(paths('recipes')).toEqual(['Bookmarks Bar/Home/Recipes', 'Bookmarks Bar/Dev/Recipes App']);
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
    const deep = findFolderMatches(tree, 'hooks', options).find((match) => match.parents.includes('React'));
    expect(paths('hooks', [deep?.folder.id ?? ''])[0]).toBe('Bookmarks Bar/Dev/Frontend/React/Hooks');
  });

  it('never offers the invisible root and highlights the matched part of the title', () => {
    expect(paths('')).toEqual([]);
    const [match] = findFolderMatches(tree, 'launch', options);
    expect(match.titleRanges).toEqual([[3, 9]]);
  });
});
