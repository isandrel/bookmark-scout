/**
 * Tunables of the bookmark manager table, from config/ui/manager-table.toml: page sizes, column
 * widths, and the save delay, date filter, and filter badge limits.
 */
import { z } from 'zod';

const pixels = z.number().int().positive();

const columnLayoutSchema = z.union([
  z.strictObject({ fixed: pixels, hide_below_width: pixels.optional() }),
  z
    .strictObject({ size: pixels, min_size: pixels, hide_below_width: pixels.optional() })
    .refine((layout) => layout.min_size <= layout.size, 'min_size must not exceed size'),
]);

const managerTableConfig = readConfig(
  'ui/manager-table',
  z
    .strictObject({
      page_sizes: z.array(pixels).min(1),
      default_page_size: pixels,
      column_sizing_save_delay_ms: z.number().int().nonnegative(),
      date_filter_months: z.number().int().min(1).max(12),
      facet_badges_max: z.number().int().nonnegative(),
      columns: z.record(z.string(), columnLayoutSchema),
    })
    .refine((config) => config.page_sizes.includes(config.default_page_size), {
      message: 'default_page_size must be one of page_sizes',
    }),
);

/** Rows per page the table offers. */
export const MANAGER_PAGE_SIZES: readonly number[] = managerTableConfig.page_sizes;

export const DEFAULT_MANAGER_PAGE_SIZE = managerTableConfig.default_page_size;

/** A page size the table offers, for validating a saved view. */
export const managerPageSizeSchema = z
  .number()
  .refine((size) => MANAGER_PAGE_SIZES.includes(size), 'Not an offered page size');

/** How long column resizing must pause before the widths are saved, in milliseconds. */
export const COLUMN_SIZING_SAVE_DELAY_MS = managerTableConfig.column_sizing_save_delay_ms;

/** Months the Date Added filter shows side by side. */
export const DATE_FILTER_MONTHS = managerTableConfig.date_filter_months;

/** Selected options a filter button names before it shows a count instead. */
export const FACET_BADGES_MAX = managerTableConfig.facet_badges_max;

/** Column ids that have a layout in the config. */
export const CONFIGURED_COLUMN_IDS: readonly string[] = Object.keys(managerTableConfig.columns);

/** A column's width and narrow-table behavior, for its registry entry in `columns.tsx`. */
export function getManagerColumnLayout(columnId: string): {
  size: BookmarkColumnSize;
  hideBelowWidth?: number;
} {
  const layout = managerTableConfig.columns[columnId];
  if (!layout)
    throw new Error(`config/ui/manager-table.toml has no width for column "${columnId}"`);
  const size: BookmarkColumnSize =
    'fixed' in layout ? { fixed: layout.fixed } : { size: layout.size, minSize: layout.min_size };
  return layout.hide_below_width === undefined
    ? { size }
    : { size, hideBelowWidth: layout.hide_below_width };
}
