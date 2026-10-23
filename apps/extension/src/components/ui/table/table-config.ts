/**
 * Tunables of the bookmark manager table, from config/ui/manager-table.toml: page sizes, the sorts a
 * new view can start with, column widths, the save delay, date filter, and filter badge limits, the
 * cards' widths, and the Cover column's thumbnail. What a new view shows and what a card shows are
 * settings (config/settings/behavior.toml).
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

/** A sort a new table view can start with: by a column, the browser's order, or neither. */
const sortChoiceSchema = z.union([
  z.strictObject({ column: z.string().min(1), desc: z.boolean(), label: z.string().min(1) }),
  z.strictObject({ browser_order: z.literal(true), label: z.string().min(1) }),
  z.strictObject({ label: z.string().min(1) }),
]);

/** Each Card Size choice's narrowest card, in pixels. */
const cardWidthsSchema = z.strictObject({ small: pixels, medium: pixels, large: pixels });

const managerTableConfig = readConfig(
  'ui/manager-table',
  z
    .strictObject({
      page_sizes: z.array(pixels).min(1),
      leading_columns: z.array(z.string().min(1)),
      column_sizing_save_delay_ms: z.number().int().nonnegative(),
      removed_row_focus_wait_ms: z.number().int().nonnegative(),
      date_filter_months: boundedNumber({ integer: true }),
      facet_badges_max: z.number().int().nonnegative(),
      card_min_width_px: cardWidthsSchema,
      cover_aspect_ratio: z.number().positive(),
      card_placeholder_icon_px: pixels,
      column_max_tags: z.number().int().positive(),
      summary_column_lines: z.number().int().positive(),
      cover_thumbnail_height_px: pixels,
      sort_choices: z.record(z.string().regex(/^[A-Za-z]+$/), sortChoiceSchema),
      columns: z.record(z.string(), columnLayoutSchema),
    })
    .refine((config) => Object.keys(config.sort_choices).length > 0, {
      message: 'sort_choices needs at least one choice',
    }),
);

/** Rows per page the table offers, and Default Rows per Page in Options. */
export const MANAGER_PAGE_SIZES: readonly number[] = managerTableConfig.page_sizes;

/** How a new table view is sorted: by a column, in the browser's order, or in the folder's order. */
export type ManagerSortChoice = {
  /** The column sort; empty keeps the folder's order. */
  sorting: Array<{ id: string; desc: boolean }>;
  browserOrder: boolean;
  /** The message key of its name in Options. */
  labelKey: string;
};

/** The sorts Default Sort offers, by id, in the config's order. */
export const MANAGER_SORT_CHOICES: Readonly<Record<string, ManagerSortChoice>> = Object.fromEntries(
  Object.entries(managerTableConfig.sort_choices).map(([id, choice]) => [
    id,
    {
      sorting: 'column' in choice ? [{ id: choice.column, desc: choice.desc }] : [],
      browserOrder: 'browser_order' in choice,
      labelKey: choice.label,
    },
  ]),
);

export const MANAGER_SORT_CHOICE_IDS = Object.keys(MANAGER_SORT_CHOICES) as [string, ...string[]];

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

/** The Card Size choices: the narrowest card of the cards view for each, in pixels. */
export const CARD_MIN_WIDTH_PX: Readonly<Record<'small' | 'medium' | 'large', number>> =
  managerTableConfig.card_min_width_px;

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
