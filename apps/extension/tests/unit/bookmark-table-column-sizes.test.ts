import { describe, expect, it } from 'vitest';
import {
  clampBookmarkColumnSize,
  getBookmarkColumnSizeDef,
  getRenderedColumnSizing,
  parseBookmarkColumnSizing,
  toSavedColumnSizing,
} from '@/lib/bookmark-table-column-sizes';
import { parseBookmarkTableLayout } from '@/lib/bookmark-table-view-storage';

const DEFAULT_VISIBLE = ['select', 'type', 'folderPath', 'url', 'title', 'dateAdded', 'actions'];

describe('bookmark table column sizes', () => {
  it('keeps the checkbox and row-menu columns fixed', () => {
    expect(getBookmarkColumnSizeDef('select')).toMatchObject({ enableResizing: false, size: 40 });
    expect(getBookmarkColumnSizeDef('actions')).toMatchObject({ enableResizing: false });
    expect(getBookmarkColumnSizeDef('title')).toMatchObject({ enableResizing: true, minSize: 120 });
    expect(clampBookmarkColumnSize('select', 300)).toBeUndefined();
    expect(clampBookmarkColumnSize('actions', 300)).toBeUndefined();
  });

  it('clamps widths to the column limits and rounds them', () => {
    expect(clampBookmarkColumnSize('title', 10)).toBe(120);
    expect(clampBookmarkColumnSize('url', 5000)).toBe(1200);
    expect(clampBookmarkColumnSize('url', 250.6)).toBe(251);
    expect(clampBookmarkColumnSize('url', Number.NaN)).toBeUndefined();
    expect(clampBookmarkColumnSize('obsolete', 200)).toBeUndefined();
  });

  it('parses saved widths, dropping unknown, fixed, and malformed entries', () => {
    expect(
      parseBookmarkColumnSizing({
        url: 320,
        title: 20,
        select: 90,
        obsolete: 100,
        type: '150',
        dateAdded: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({ url: 320, title: 120 });
    expect(parseBookmarkColumnSizing(undefined)).toEqual({});
    expect(parseBookmarkColumnSizing([300])).toEqual({});
  });

  it('lets Title and URL share the spare width 3:2 until sized, never below their defaults', () => {
    // The other columns: 40 + 120 + 180 + 184 + 140 = 664.
    expect(getRenderedColumnSizing({}, DEFAULT_VISIBLE, 1504.6)).toEqual({ url: 336, title: 504 });
    // Rounding leftovers go to the first fill column, so the table is filled exactly.
    expect(getRenderedColumnSizing({}, DEFAULT_VISIBLE, 1505)).toEqual({ url: 337, title: 504 });
    // A share below a column's default gives it the default; the other takes the rest.
    expect(getRenderedColumnSizing({}, DEFAULT_VISIBLE, 1100)).toEqual({ url: 200, title: 236 });
    expect(getRenderedColumnSizing({}, DEFAULT_VISIBLE, 700)).toEqual({ url: 200, title: 160 });
    expect(getRenderedColumnSizing({}, DEFAULT_VISIBLE, undefined)).toEqual({
      url: 200,
      title: 160,
    });
    // A sized fill column keeps its width and the other one takes the rest.
    expect(getRenderedColumnSizing({ url: 300 }, DEFAULT_VISIBLE, 1400)).toEqual({
      url: 300,
      title: 436,
    });
    expect(getRenderedColumnSizing({ title: 250 }, DEFAULT_VISIBLE, 1400)).toEqual({
      title: 250,
      url: 486,
    });
    const withoutTitle = DEFAULT_VISIBLE.filter((id) => id !== 'title');
    expect(getRenderedColumnSizing({}, withoutTitle, 1400)).toEqual({ url: 736 });
    const sized = { title: 250, url: 300 };
    expect(getRenderedColumnSizing(sized, DEFAULT_VISIBLE, 1400)).toBe(sized);
    // Never past the widest a column may be; the table's filler cell takes the rest.
    expect(getRenderedColumnSizing({}, ['select', 'title', 'url', 'actions'], 4000)).toEqual({
      title: 1200,
      url: 1200,
    });
  });

  it('saves only widths the user changed', () => {
    const rendered = { title: 302, url: 200 };
    // Dragging URL keeps Title filling.
    expect(toSavedColumnSizing({ title: 302, url: 320 }, rendered, {})).toEqual({ url: 320 });
    // A click on a fill column's handle commits its current width without pinning it.
    expect(toSavedColumnSizing({ title: 302, url: 200 }, rendered, {})).toEqual({});
    // Resizing Title pins it, clamped to its minimum.
    expect(toSavedColumnSizing({ title: 40 }, rendered, {})).toEqual({ title: 120 });
    // A saved Title that matches the rendered width stays saved.
    expect(toSavedColumnSizing({ title: 302 }, rendered, { title: 302 })).toEqual({ title: 302 });
    // Returning a column to its default width forgets it.
    expect(toSavedColumnSizing({ folderPath: 180, type: 90 }, {}, { folderPath: 320 })).toEqual({
      type: 90,
    });
    // Fixed and unknown columns are never saved.
    expect(toSavedColumnSizing({ select: 80, obsolete: 100 }, {}, {})).toEqual({});
  });

  it('round-trips widths through the saved table layout', () => {
    expect(parseBookmarkTableLayout({ columnSizing: { url: 320 } }).columnSizing).toEqual({
      url: 320,
    });
    // A malformed width drops that width, not the rest of the saved layout.
    const view = parseBookmarkTableLayout({
      pageSize: 20,
      columnSizing: { url: 'wide', title: 300 },
    });
    expect(view.pageSize).toBe(20);
    expect(view.columnSizing).toEqual({ title: 300 });
    expect(parseBookmarkTableLayout({}).columnSizing).toEqual({});
  });
});
