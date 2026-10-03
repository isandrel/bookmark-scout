import { describe, expect, it } from 'vitest';
import { BOOKMARK_COLUMNS } from '@/components/ui/table/columns';
import {
  CONFIGURED_COLUMN_IDS,
  DEFAULT_MANAGER_PAGE_SIZE,
  getManagerColumnLayout,
  MANAGER_PAGE_SIZES,
  managerPageSizeSchema,
} from '@/components/ui/table/table-config';
import { DEFAULT_BOOKMARK_TABLE_VIEW } from '@/lib/bookmark-table-view-storage';
import { readConfigToml } from '../config-files';

describe('manager table config', () => {
  const toml = readConfigToml('ui/manager-table.toml') as {
    page_sizes: number[];
    default_page_size: number;
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
    }
    expect(() => getManagerColumnLayout('no-such-column')).toThrow(/no width/);
  });
});
