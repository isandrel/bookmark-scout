import { describe, expect, it } from 'vitest';
import { BOOKMARK_COLUMNS } from '@/components/ui/table/columns';
import {
  CARD_MIN_WIDTH_PX,
  CONFIGURED_COLUMN_IDS,
  COVER_ASPECT_RATIO,
  COVER_THUMBNAIL_SIZE_PX,
  getManagerColumnLayout,
  MANAGER_PAGE_SIZES,
  MANAGER_SORT_CHOICES,
  managerPageSizeSchema,
} from '@/components/ui/table/table-config';
import {
  DEFAULT_BOOKMARK_TABLE_VIEW,
  HIDEABLE_COLUMN_IDS,
  isSortableBookmarkColumn,
} from '@/lib/bookmark-table-view-storage';
import {
  defaultSettings,
  getSettingsFieldMeta,
  MANAGER_CARD_FIELDS,
  managerCardSizeSchema,
  PREVIEW_FIELDS,
} from '@/lib/settings-schema';
import enMessages from '../../public/_locales/en/messages.json';
import { readConfigToml } from '../config-files';

describe('manager table config', () => {
  const toml = readConfigToml('ui/manager-table.toml') as {
    page_sizes: number[];
    sort_choices: Record<string, { column?: string; desc?: boolean; browser_order?: boolean }>;
  };
  const behavior = readConfigToml('settings/behavior.toml') as {
    manager_table: { columns: { default: string[] }; page_size: number; sort: string };
  };

  it('offers the page sizes from the config, including the default', () => {
    expect(MANAGER_PAGE_SIZES).toEqual(toml.page_sizes);
    expect(defaultSettings.managerDefaultPageSize).toBe(behavior.manager_table.page_size);
    expect(MANAGER_PAGE_SIZES).toContain(defaultSettings.managerDefaultPageSize);
    expect(managerPageSizeSchema.safeParse(defaultSettings.managerDefaultPageSize).success).toBe(
      true,
    );
    expect(managerPageSizeSchema.safeParse(7).success).toBe(false);
    // Default Rows per Page offers exactly these.
    const options = getSettingsFieldMeta().managerDefaultPageSize.options?.map((o) => o.value);
    expect(options).toEqual(toml.page_sizes);
  });

  it('keeps the saved view default in step with the config', () => {
    expect(DEFAULT_BOOKMARK_TABLE_VIEW.pageSize).toBe(behavior.manager_table.page_size);
    expect(defaultSettings.managerDefaultColumns).toEqual(behavior.manager_table.columns.default);
    const shown = DEFAULT_BOOKMARK_TABLE_VIEW.columnOrder.filter(
      (id) =>
        DEFAULT_BOOKMARK_TABLE_VIEW.columnVisibility[id] !== false &&
        HIDEABLE_COLUMN_IDS.includes(id),
    );
    expect(shown).toEqual(behavior.manager_table.columns.default);
    expect(defaultSettings.managerDefaultSort).toBe(behavior.manager_table.sort);
    expect(DEFAULT_BOOKMARK_TABLE_VIEW).toMatchObject({ sorting: [], browserOrder: false });
  });

  it('offers default sorts by columns that sort, each with a name', () => {
    expect(Object.keys(MANAGER_SORT_CHOICES)).toEqual(Object.keys(toml.sort_choices));
    for (const [id, choice] of Object.entries(MANAGER_SORT_CHOICES)) {
      for (const { id: column } of choice.sorting)
        expect(isSortableBookmarkColumn(column), id).toBe(true);
      expect(choice.labelKey in enMessages, id).toBe(true);
    }
    expect(MANAGER_SORT_CHOICES.dateAddedDesc).toMatchObject({
      sorting: [{ id: 'dateAdded', desc: true }],
      browserOrder: false,
    });
    expect(MANAGER_SORT_CHOICES.browser).toMatchObject({ sorting: [], browserOrder: true });
  });

  it('offers every default column, card detail, and preview detail the settings may hold', () => {
    const meta = getSettingsFieldMeta();
    const fits = (
      key: 'managerDefaultColumns' | 'managerCardFields' | 'previewFields',
      ids: readonly string[],
    ) => {
      expect(ids.length, key).toBeLessThanOrEqual(meta[key].maxItems ?? 0);
      for (const id of ids) expect(id.length, id).toBeLessThanOrEqual(meta[key].maxLength ?? 0);
    };
    fits('managerDefaultColumns', HIDEABLE_COLUMN_IDS);
    fits('managerCardFields', MANAGER_CARD_FIELDS);
    fits('previewFields', PREVIEW_FIELDS);
    expect(
      defaultSettings.managerCardFields.every((id) =>
        (MANAGER_CARD_FIELDS as readonly string[]).includes(id),
      ),
    ).toBe(true);
    expect(defaultSettings.previewFields).toEqual([...PREVIEW_FIELDS]);
    // Every Card Size has a width, and they grow from small to large.
    expect(Object.keys(CARD_MIN_WIDTH_PX)).toEqual(managerCardSizeSchema.options);
    expect(CARD_MIN_WIDTH_PX.small).toBeLessThan(CARD_MIN_WIDTH_PX.medium);
    expect(CARD_MIN_WIDTH_PX.medium).toBeLessThan(CARD_MIN_WIDTH_PX.large);
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
    expect(defaultSettings.managerDefaultPageSize).toBe(50);
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
