/**
 * The date and time formats the user picks in Settings > Appearance > Dates and Times
 * (`config/ui/date-formats.toml`), turned into `Intl.DateTimeFormat` options. Every date the
 * extension shows goes through `formatDateTime`, `formatDay`, and `formatTime` (`use-i18n.ts`),
 * which read the current choice set here from the settings, so one setting changes them all.
 */
import { z } from 'zod';

const NUMERIC = z.enum(['numeric', '2-digit']);
const STYLE = z.enum(['full', 'long', 'medium', 'short']);

const dateFormatSchema = z.strictObject({
  label: z.string().min(1),
  locale: z.string().optional(),
  date_style: STYLE.optional(),
  year: NUMERIC.optional(),
  month: z.enum(['numeric', '2-digit', 'long', 'short', 'narrow']).optional(),
  day: NUMERIC.optional(),
});
type DateFormatConfig = z.infer<typeof dateFormatSchema>;

const timeFormatSchema = z.strictObject({
  label: z.string().min(1),
  hour: NUMERIC,
  hour_cycle: z.enum(['h11', 'h12', 'h23', 'h24']).optional(),
});

const formatsConfig = readConfig(
  'ui/date-formats',
  z.strictObject({
    time_parts: z.strictObject({ minute: NUMERIC, second: NUMERIC, time_style: STYLE }),
    date_formats: z.record(z.string(), dateFormatSchema),
    time_formats: z.record(z.string(), timeFormatSchema),
  }),
);

/** The format `id` of `kind`; the settings only store ids from this config. */
function formatOf<Format>(formats: Readonly<Record<string, Format>>, id: string): Format {
  const format = formats[id];
  if (!format) throw new Error(`Unknown date or time format: ${id}`);
  return format;
}

export const DATE_FORMAT_IDS = Object.keys(formatsConfig.date_formats) as [string, ...string[]];
export const TIME_FORMAT_IDS = Object.keys(formatsConfig.time_formats) as [string, ...string[]];

/** The label message key of a format, for the settings list. */
export function dateFormatLabelKey(kind: 'date' | 'time', id: string): MessageKey {
  const formats = kind === 'date' ? formatsConfig.date_formats : formatsConfig.time_formats;
  return formatOf(formats, id).label;
}

type FormatChoice = { date: string; time: string };

/**
 * The user's choice, once the settings are read; until then the settings' defaults, which
 * `settings-schema.ts` hands over (`setDefaultDateTimeFormat`) so they have one source.
 */
let chosen: FormatChoice | undefined;
let defaults: FormatChoice | undefined;

export function setDefaultDateTimeFormat(date: string, time: string): void {
  defaults = { date, time };
}

function currentChoice(): FormatChoice {
  const choice = chosen ?? defaults;
  if (!choice) throw new Error('The date and time format settings are not loaded');
  return choice;
}

/** Applies the user's choice; returns whether it changed, so pages show dates again. */
export function setDateTimeFormatChoice(date: string, time: string): boolean {
  const current = currentChoice();
  if (current.date === date && current.time === time) return false;
  chosen = { date, time };
  return true;
}

function dateOptions(config: DateFormatConfig): Intl.DateTimeFormatOptions {
  return config.date_style
    ? { dateStyle: config.date_style }
    : {
        ...(config.year ? { year: config.year } : {}),
        ...(config.month ? { month: config.month } : {}),
        ...(config.day ? { day: config.day } : {}),
      };
}

/**
 * The locale and options for showing a date (`day`), a time of day (`time`), or both
 * (`dateTime`, with seconds) in the chosen formats. `locale` is undefined unless a format pins
 * one; the caller then uses the extension's language.
 */
export function dateTimeFormatOptions(
  kind: 'day' | 'time' | 'dateTime',
  choice: { date: string; time: string } = currentChoice(),
): { locale?: string; options: Intl.DateTimeFormatOptions } {
  const date = formatOf(formatsConfig.date_formats, choice.date);
  const time = formatOf(formatsConfig.time_formats, choice.time);
  const parts = formatsConfig.time_parts;
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: time.hour,
    minute: parts.minute,
    ...(kind === 'dateTime' ? { second: parts.second } : {}),
    ...(time.hour_cycle ? { hourCycle: time.hour_cycle } : {}),
  };
  const day = dateOptions(date);
  // dateStyle cannot be mixed with single time fields, so a styled date takes timeStyle.
  const options =
    kind === 'day'
      ? day
      : kind === 'time'
        ? timeOptions
        : date.date_style
          ? {
              ...day,
              timeStyle: parts.time_style,
              ...(time.hour_cycle ? { hourCycle: time.hour_cycle } : {}),
            }
          : { ...day, ...timeOptions };
  // The pinned locale orders the date; a time alone follows the language.
  return { ...(date.locale && kind !== 'time' ? { locale: date.locale } : {}), options };
}
