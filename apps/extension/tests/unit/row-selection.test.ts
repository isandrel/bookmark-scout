import { describe, expect, it } from 'vitest';
import { ItemTypeEnum } from '@/lib/manager-bookmark';
import { getOpenableUrls } from '@/lib/bookmark-manager-data';
import { rowSelectionChangeFor, selectRows } from '@/lib/row-selection';

const ids = ['a', 'b', 'c', 'd', 'e'];
const none = { selected: new Set<string>(), anchorId: null };
const ids2 = (state: { selected: ReadonlySet<string> }) => [...state.selected].sort();

describe('selectRows', () => {
  const click = rowSelectionChangeFor({ shiftKey: false, toggleKey: false });
  const ctrlClick = rowSelectionChangeFor({ shiftKey: false, toggleKey: true });
  const shiftClick = rowSelectionChangeFor({ shiftKey: true, toggleKey: false });
  const ctrlShiftClick = rowSelectionChangeFor({ shiftKey: true, toggleKey: true });

  it('selects one row on click and makes it the anchor', () => {
    const state = selectRows({ selected: new Set(['a', 'b']), anchorId: 'a' }, ids, 'c', click);
    expect(ids2(state)).toEqual(['c']);
    expect(state.anchorId).toBe('c');
  });

  it('adds and removes rows with Ctrl or Cmd', () => {
    let state = selectRows(none, ids, 'b', click);
    state = selectRows(state, ids, 'd', ctrlClick);
    expect(ids2(state)).toEqual(['b', 'd']);
    state = selectRows(state, ids, 'b', ctrlClick);
    expect(ids2(state)).toEqual(['d']);
    expect(state.anchorId).toBe('b');
  });

  it('selects the range from the anchor with Shift, in either direction, keeping the anchor', () => {
    let state = selectRows(none, ids, 'b', click);
    state = selectRows(state, ids, 'd', shiftClick);
    expect(ids2(state)).toEqual(['b', 'c', 'd']);
    state = selectRows(state, ids, 'a', shiftClick);
    expect(ids2(state)).toEqual(['a', 'b']);
    expect(state.anchorId).toBe('b');
  });

  it('adds a range to the selection with Ctrl+Shift', () => {
    let state = selectRows(none, ids, 'a', click);
    state = selectRows(state, ids, 'c', ctrlClick);
    state = selectRows(state, ids, 'e', ctrlShiftClick);
    expect(ids2(state)).toEqual(['a', 'c', 'd', 'e']);
  });

  it('never selects rows that cannot be selected', () => {
    const canSelect = (id: string) => id !== 'c';
    let state = selectRows(none, ids, 'a', click, canSelect);
    state = selectRows(state, ids, 'e', shiftClick, canSelect);
    expect(ids2(state)).toEqual(['a', 'b', 'd', 'e']);
    expect(ids2(selectRows(none, ids, 'c', click, canSelect))).toEqual([]);
  });
});

describe('getOpenableUrls', () => {
  const item = (id: string, parentId: string, index: number, url?: string) => ({
    id,
    parentId,
    index,
    title: id,
    folderPath: '',
    type: url ? ItemTypeEnum.Link : ItemTypeEnum.Folder,
    ...(url ? { url } : {}),
  });
  const items = [
    item('f', 'root', 0),
    item('f2', 'f', 0),
    item('x2', 'f2', 0, 'https://deep.example/'),
    item('x1', 'f', 2, 'https://second.example/'),
    item('x0', 'f', 1, 'https://first.example/'),
    item('js', 'f', 3, 'javascript:alert(1)'),
    item('b', 'root', 1, 'https://bookmark.example/'),
  ];

  it("opens a bookmark's URL and the bookmarks directly in a folder, in folder order", () => {
    const rows = [items[6], items[0]];
    expect(getOpenableUrls(rows, items)).toEqual([
      'https://bookmark.example/',
      'https://first.example/',
      'https://second.example/',
    ]);
  });
});
