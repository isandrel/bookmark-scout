import { describe, expect, it } from 'vitest';
import {
  availableMoves,
  orderByIds,
  reorderByDrop,
  reorderByMove,
  SORTABLE_FLASH_MS,
  SORTABLE_MOVES,
} from '@/lib/sortable';
import { readConfigToml } from '../config-files';

const ids = ['a', 'b', 'c', 'd'];

describe('reorderByDrop', () => {
  it('puts the item before or after the target', () => {
    expect(reorderByDrop(ids, 'd', 'b', 'top')).toEqual(['a', 'd', 'b', 'c']);
    expect(reorderByDrop(ids, 'a', 'c', 'bottom')).toEqual(['b', 'c', 'a', 'd']);
    expect(reorderByDrop(ids, 'a', 'd', 'bottom')).toEqual(['b', 'c', 'd', 'a']);
  });

  it('returns null when the order would not change', () => {
    expect(reorderByDrop(ids, 'b', 'b', 'top')).toBeNull();
    expect(reorderByDrop(ids, 'b', 'c', 'top')).toBeNull();
    expect(reorderByDrop(ids, 'c', 'b', 'bottom')).toBeNull();
    expect(reorderByDrop(ids, 'x', 'b', 'top')).toBeNull();
  });

  it('never moves an item that keeps its place, or drops beside one', () => {
    const movable = (id: string) => id !== 'd';
    expect(reorderByDrop(ids, 'd', 'a', 'top', movable)).toBeNull();
    expect(reorderByDrop(ids, 'a', 'd', 'top', movable)).toBeNull();
  });
});

describe('reorderByMove', () => {
  it('moves to the top, up, down, and to the bottom', () => {
    expect(reorderByMove(ids, 'c', 'top')).toEqual(['c', 'a', 'b', 'd']);
    expect(reorderByMove(ids, 'c', 'up')).toEqual(['a', 'c', 'b', 'd']);
    expect(reorderByMove(ids, 'b', 'down')).toEqual(['a', 'c', 'b', 'd']);
    expect(reorderByMove(ids, 'b', 'bottom')).toEqual(['a', 'c', 'd', 'b']);
  });

  it('cannot move past either end', () => {
    expect(reorderByMove(ids, 'a', 'up')).toBeNull();
    expect(reorderByMove(ids, 'a', 'top')).toBeNull();
    expect(reorderByMove(ids, 'd', 'down')).toBeNull();
    expect(reorderByMove(ids, 'd', 'bottom')).toBeNull();
  });

  it('moves only among the movable items, and fixed ones keep their places', () => {
    // Hidden menu commands (c, d) sit after the shown ones and keep their place.
    const shown = (id: string) => id === 'a' || id === 'b';
    expect(reorderByMove(ids, 'a', 'bottom', shown)).toEqual(['b', 'a', 'c', 'd']);
    expect(reorderByMove(ids, 'b', 'down', shown)).toBeNull();
    expect(reorderByMove(ids, 'c', 'up', shown)).toBeNull();
    const notB = (id: string) => id !== 'b';
    // A fixed item keeps its place; a moves past it to the next movable slot.
    expect(reorderByMove(ids, 'a', 'down', notB)).toEqual(['c', 'b', 'a', 'd']);
  });
});

describe('availableMoves', () => {
  it('enables only the moves that change the order', () => {
    expect(availableMoves(ids, 'a')).toEqual({ top: false, up: false, down: true, bottom: true });
    expect(availableMoves(ids, 'b')).toEqual({ top: true, up: true, down: true, bottom: true });
    expect(Object.keys(availableMoves(ids, 'd'))).toEqual([...SORTABLE_MOVES]);
  });
});

it('reads the flash length from config/ui/sortable-list.toml', () => {
  expect(SORTABLE_FLASH_MS).toBe(readConfigToml('ui/sortable-list.toml').flash_ms);
});

describe('orderByIds', () => {
  it('orders items by id, skips ids that are gone, and keeps new items at the end', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'new' }];
    const ordered = orderByIds(items, (item) => item.id, ['c', 'gone', 'a', 'b']);
    expect(ordered.map((item) => item.id)).toEqual(['c', 'a', 'b', 'new']);
  });
});

describe('reorderByDrop across a row', () => {
  it('drops before or after the target on its left or right edge', () => {
    expect(reorderByDrop(ids, 'd', 'b', 'left')).toEqual(['a', 'd', 'b', 'c']);
    expect(reorderByDrop(ids, 'a', 'c', 'right')).toEqual(['b', 'c', 'a', 'd']);
    expect(reorderByDrop(ids, 'b', 'c', 'left')).toBeNull();
  });
});
