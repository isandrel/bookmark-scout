import { describe, expect, it } from 'vitest';
import { findRestoreIndex, mergeSiblingOrder } from '@/lib/deletion-order';

describe('mergeSiblingOrder', () => {
  it('keeps restorable tombstones in place and drops items that are simply gone', () => {
    const tombstones = new Set(['t1']);
    expect(
      mergeSiblingOrder(['a', 't1', 'gone', 'b'], ['a', 'b'], (id) => tombstones.has(id)),
    ).toEqual(['a', 't1', 'b']);
  });

  it('inserts new live children after the live child that precedes them', () => {
    expect(
      mergeSiblingOrder(['a', 't1', 'b'], ['new', 'a', 'b', 'c'], (id) => id === 't1'),
    ).toEqual(['new', 'a', 't1', 'b', 'c']);
    expect(mergeSiblingOrder(undefined, ['a', 'b'], () => false)).toEqual(['a', 'b']);
  });
});

describe('findRestoreIndex', () => {
  const live = (ids: string[]) => new Map(ids.map((id, index) => [id, index]));

  it('goes before the nearest later live sibling', () => {
    expect(findRestoreIndex(['k', 't1', 't2', 'l'], 't1', live(['k', 'l']))).toBe(1);
    expect(findRestoreIndex(['k', 't1', 't2', 'l'], 't1', live(['k', 't2', 'l']))).toBe(1);
  });

  it('falls back to after the nearest earlier live sibling, then to the start', () => {
    expect(findRestoreIndex(['k', 't1', 't2'], 't2', live(['k', 't1']))).toBe(2);
    expect(findRestoreIndex(['t1', 't2'], 't2', live([]))).toBe(0);
  });

  it('is undefined for items it never saw', () => {
    expect(findRestoreIndex(['a'], 'b', live(['a']))).toBeUndefined();
  });
});
