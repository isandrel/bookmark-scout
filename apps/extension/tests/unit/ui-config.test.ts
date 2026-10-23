import { describe, expect, it } from 'vitest';
import { BOOKMARK_COLUMNS } from '@/components/ui/table/columns';
import {
  CONFIGURED_COLUMN_IDS,
  COVER_ASPECT_RATIO,
  COVER_THUMBNAIL_SIZE_PX,
  DEFAULT_MANAGER_COLUMN_IDS,
  DEFAULT_MANAGER_PAGE_SIZE,
  getManagerColumnLayout,
  MANAGER_PAGE_SIZES,
  managerPageSizeSchema,
} from '@/components/ui/table/table-config';
import { DEFAULT_BOOKMARK_TABLE_VIEW } from '@/lib/bookmark-table-view-storage';
import { defaultSettings } from '@/lib/settings-schema';
import { readConfigToml } from '../config-files';

describe('manager table config', () => {
  const toml = readConfigToml('ui/manager-table.toml') as {
    page_sizes: number[];
    default_page_size: number;
    default_columns: string[];
  };

  it('offers the page sizes from the config, including the default', () => {
    expect(MANAGER_PAGE_SIZES).toEqual(toml.page_sizes);
    expect(DEFAULT_MANAGER_PAGE_SIZE).toBe(toml.default_page_size);
    expect(MANAGER_PAGE_SIZES).toContain(DEFAULT_MANAGER_PAGE_SIZE);
    expect(managerPageSizeSchema.safeParse(DEFAULT_MANAGER_PAGE_SIZE).success).toBe(true);
    expect(managerPageSizeSchema.safeParse(7).success).toBe(false);
  });

  it('keeps the saved view default in step with the config', () => {
    expect(DEFAULT_BOOKMARK_TABLE_VIEW.pageSize).toBe(DEFAULT_MANAGER_PAGE_SIZE);
    expect(DEFAULT_MANAGER_COLUMN_IDS).toEqual(toml.default_columns);
    const shown = DEFAULT_BOOKMARK_TABLE_VIEW.columnOrder.filter(
      (id) =>
        DEFAULT_BOOKMARK_TABLE_VIEW.columnVisibility[id] !== false &&
        DEFAULT_MANAGER_COLUMN_IDS.includes(id),
    );
    expect(shown).toEqual(toml.default_columns);
  });

  it('sizes the Cover thumbnail at the cover ratio to fit a 32px row and its fixed column', () => {
    // Table cells are padded 4px above and below and 12px on each side (`TableCell`).
    const rowPx = 32;
    const cellPaddingPx = { block: 4, inline: 12 };
    expect(COVER_THUMBNAIL_SIZE_PX.height).toBeLessThanOrEqual(rowPx - 2 * cellPaddingPx.block);
    expect(COVER_THUMBNAIL_SIZE_PX.width).toBe(
      Math.round(COVER_THUMBNAIL_SIZE_PX.height * COVER_ASPECT_RATIO),
    );
    const { size } = getManagerColumnLayout('cover');
    expect('fixed' in size && size.fixed).toBeGreaterThanOrEqual(
      COVER_THUMBNAIL_SIZE_PX.width + 2 * cellPaddingPx.inline,
    );
  });

  it('opens a new view with a page of 50 rows, so most folders fit on one page', () => {
    expect(DEFAULT_MANAGER_PAGE_SIZE).toBe(50);
  });

  it('lists the popup tree and the manager table in the browser order by default', () => {
    expect(defaultSettings.sortOrder).toBe('browser');
  });

  it('has a width for exactly the displayed columns of the registry', () => {
    const displayed = BOOKMARK_COLUMNS.filter((column) => !column.internal).map(
      (column) => column.id,
    );
    expect([...CONFIGURED_COLUMN_IDS].sort()).toEqual([...displayed].sort());
  });

  it('gives registry columns their configured widths', () => {
    for (const column of BOOKMARK_COLUMNS.filter((entry) => !entry.internal)) {
      const layout = getManagerColumnLayout(column.id);
      expect(column.size).toEqual(layout.size);
      expect(column.hideBelowWidth).toBe(layout.hideBelowWidth);
      expect(column.fillWeight).toBe(layout.fillWeight);
    }
    // Title and URL share the spare width, Title a bit more; the dates keep a compact width.
    expect(getManagerColumnLayout('title').fillWeight).toBeGreaterThan(
      getManagerColumnLayout('url').fillWeight ?? Number.POSITIVE_INFINITY,
    );
    expect(getManagerColumnLayout('dateAdded').fillWeight).toBeUndefined();
    expect(() => getManagerColumnLayout('no-such-column')).toThrow(/no width/);
  });
});
