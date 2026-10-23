/**
 * Tunables of the bookmark manager table, from config/ui/manager-table.toml: page sizes, column
 * widths, the save delay, date filter, and filter badge limits, what the cards view shows, and the
 * Cover column's thumbnail.
 */
import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';

const pixels = z.number().int().positive();

const columnLayoutSchema = z.union([
  z.strictObject({ fixed: pixels, hide_below_width: pixels.optional() }),
  z
    .strictObject({
      size: pixels,
      min_size: pixels,
      fill: z.number().positive().optional(),
      hide_below_width: pixels.optional(),
    })
    .refine((layout) => layout.min_size <= layout.size, 'min_size must not exceed size'),
]);

const managerTableConfig = readConfig(
  'ui/manager-table',
  z
    .strictObject({
      page_sizes: z.array(pixels).min(1),
      default_page_size: pixels,
      default_columns: z.array(z.string().min(1)).min(1),
      leading_columns: z.array(z.string().min(1)),
      column_sizing_save_delay_ms: z.number().int().nonnegative(),
      removed_row_focus_wait_ms: z.number().int().nonnegative(),
      date_filter_months: boundedNumber({ integer: true }),
      facet_badges_max: z.number().int().nonnegative(),
      card_min_width_px: z.number().int().positive(),
      card_max_tags: z.number().int().positive(),
      card_summary_lines: z.number().int().positive(),
      cover_aspect_ratio: z.number().positive(),
      card_placeholder_icon_px: pixels,
      column_max_tags: z.number().int().positive(),
      summary_column_lines: z.number().int().positive(),
      cover_thumbnail_height_px: pixels,
      columns: z.record(z.string(), columnLayoutSchema),
    })
    .refine((config) => config.page_sizes.includes(config.default_page_size), {
      message: 'default_page_size must be one of page_sizes',
    })
    .refine(
      (config) => config.leading_columns.every((id) => !config.default_columns.includes(id)),
      { message: 'leading_columns are hidden at first, so none may be in default_columns' },
    ),
);

/** Rows per page the table offers. */
export const MANAGER_PAGE_SIZES: readonly number[] = managerTableConfig.page_sizes;

export const DEFAULT_MANAGER_PAGE_SIZE = managerTableConfig.default_page_size;

/** Column ids a new table view shows, in order; the saved view's defaults are built from them. */
export const DEFAULT_MANAGER_COLUMN_IDS: readonly string[] = managerTableConfig.default_columns;

/** Hidden column ids placed right after the checkbox, before the default ones, once shown. */
export const LEADING_MANAGER_COLUMN_IDS: readonly string[] = managerTableConfig.leading_columns;

/** A page size the table offers, for validating a saved view. */
export const managerPageSizeSchema = z
  .number()
  .refine((size) => MANAGER_PAGE_SIZES.includes(size), 'Not an offered page size');

/** How long column resizing must pause before the widths are saved, in milliseconds. */
export const COLUMN_SIZING_SAVE_DELAY_MS = managerTableConfig.column_sizing_save_delay_ms;

/**
 * How long, in milliseconds, the table waits for focus to come back (from a closing confirmation)
 * before it gives up moving focus from a removed row to the next one.
 */
export const REMOVED_ROW_FOCUS_WAIT_MS = managerTableConfig.removed_row_focus_wait_ms;

/** Months the Date Added filter shows side by side. */
export const DATE_FILTER_MONTHS = managerTableConfig.date_filter_months;

/** Selected options a filter button names before it shows a count instead. */
export const FACET_BADGES_MAX = managerTableConfig.facet_badges_max;

/** The narrowest card of the cards view, in pixels. */
export const CARD_MIN_WIDTH_PX = managerTableConfig.card_min_width_px;

/** Tag chips a card shows before a "+N" chip for the rest. */
export const CARD_MAX_TAGS = managerTableConfig.card_max_tags;

/** Lines of a bookmark's summary a card shows. */
export const CARD_SUMMARY_LINES = managerTableConfig.card_summary_lines;

/** Width over height of a cover, and of the room a card keeps for it. */
export const COVER_ASPECT_RATIO = managerTableConfig.cover_aspect_ratio;

/** The site or folder icon in a card's room for a cover while it has none, in pixels. */
export const CARD_PLACEHOLDER_ICON_PX = managerTableConfig.card_placeholder_icon_px;

/** Tag chips the Tags column shows before a "+N" chip. */
export const COLUMN_MAX_TAGS = managerTableConfig.column_max_tags;

/** Lines of a bookmark's summary the Summary column shows. */
export const SUMMARY_COLUMN_LINES = managerTableConfig.summary_column_lines;

/** The Cover column's thumbnail: its height in pixels, and its width at the cover ratio. */
export const COVER_THUMBNAIL_SIZE_PX = {
  height: managerTableConfig.cover_thumbnail_height_px,
  width: Math.round(managerTableConfig.cover_thumbnail_height_px * COVER_ASPECT_RATIO),
} as const;

/** Column ids that have a layout in the config. */
export const CONFIGURED_COLUMN_IDS: readonly string[] = Object.keys(managerTableConfig.columns);

/** A column's width and narrow-table behavior, for its registry entry in `columns.tsx`. */
export function getManagerColumnLayout(columnId: string): {
  size: BookmarkColumnSize;
  fillWeight?: number;
  hideBelowWidth?: number;
} {
  const layout = managerTableConfig.columns[columnId];
  if (!layout)
    throw new Error(`config/ui/manager-table.toml has no width for column "${columnId}"`);
  const size: BookmarkColumnSize =
    'fixed' in layout ? { fixed: layout.fixed } : { size: layout.size, minSize: layout.min_size };
  const fillWeight = 'fill' in layout ? layout.fill : undefined;
  return {
    size,
    ...(fillWeight === undefined ? {} : { fillWeight }),
    ...(layout.hide_below_width === undefined ? {} : { hideBelowWidth: layout.hide_below_width }),
  };
}
