import { describe, expect, it } from 'vitest';
import {
  clampBookmarkColumnSize,
  getBookmarkColumnSizeDef,
  getRenderedColumnSizing,
  parseBookmarkColumnSizing,
  toSavedColumnSizing,
} from '@/lib/bookmark-table-column-sizes';
import { parseBookmarkTableView } from '@/lib/bookmark-table-view-storage';

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

  it('lets Title fill the spare width until it is sized, never below its default', () => {
    // Fixed and default widths: 40 + 120 + 180 + 200 + 190 + 68 = 798.
    expect(getRenderedColumnSizing({}, DEFAULT_VISIBLE, 1100.6)).toEqual({ title: 302 });
    expect(getRenderedColumnSizing({ url: 300 }, DEFAULT_VISIBLE, 1100)).toEqual({
      url: 300,
      title: 202,
    });
    expect(getRenderedColumnSizing({}, DEFAULT_VISIBLE, 700)).toEqual({ title: 160 });
    expect(getRenderedColumnSizing({}, DEFAULT_VISIBLE, undefined)).toEqual({ title: 160 });
    expect(getRenderedColumnSizing({ title: 250 }, DEFAULT_VISIBLE, 1400)).toEqual({ title: 250 });
    const withoutTitle = DEFAULT_VISIBLE.filter((id) => id !== 'title');
    expect(getRenderedColumnSizing({}, withoutTitle, 1400)).toEqual({});
  });

  it('saves only widths the user changed', () => {
    const rendered = { title: 302 };
    // Dragging URL keeps Title filling.
    expect(toSavedColumnSizing({ title: 302, url: 320 }, rendered, {})).toEqual({ url: 320 });
    // A click on Title's handle commits its current width without pinning it.
    expect(toSavedColumnSizing({ title: 302 }, rendered, {})).toEqual({});
    // Resizing Title pins it, clamped to its minimum.
    expect(toSavedColumnSizing({ title: 40 }, rendered, {})).toEqual({ title: 120 });
    // A saved Title that matches the rendered width stays saved.
    expect(toSavedColumnSizing({ title: 302 }, rendered, { title: 302 })).toEqual({ title: 302 });
    // Returning a column to its default width forgets it.
    expect(toSavedColumnSizing({ url: 200, type: 90 }, {}, { url: 320 })).toEqual({ type: 90 });
    // Fixed and unknown columns are never saved.
    expect(toSavedColumnSizing({ select: 80, obsolete: 100 }, {}, {})).toEqual({});
  });

  it('round-trips widths through the saved table view', () => {
    expect(parseBookmarkTableView({ version: 1, columnSizing: { url: 320 } }).columnSizing).toEqual(
      {
        url: 320,
      },
    );
    // A malformed width drops that width, not the rest of the saved view.
    const view = parseBookmarkTableView({
      version: 1,
      pageSize: 20,
      columnSizing: { url: 'wide', title: 300 },
    });
    expect(view.pageSize).toBe(20);
    expect(view.columnSizing).toEqual({ title: 300 });
    expect(parseBookmarkTableView({ version: 1 }).columnSizing).toEqual({});
  });
});
