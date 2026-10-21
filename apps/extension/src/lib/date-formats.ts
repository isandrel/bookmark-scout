/**
 * The date and time formats the user picks in Settings > Appearance > Dates and Times
 * (`config/ui/date-formats.toml`), turned into `Intl.DateTimeFormat` options. Every date the
 * extension shows goes through `formatDateTime`, `formatDay`, and `formatTime` (`use-i18n.ts`),
 * which read the current choice set here from the settings, so one setting changes them all.
 */
import { z } from 'zod';

const formatSchema = z.strictObject({
  label: z.string().min(1),
  locale: z.string().optional(),
  date_style: z.enum(['full', 'long', 'medium', 'short']).optional(),
  year: z.enum(['numeric', '2-digit']).optional(),
  month: z.enum(['numeric', '2-digit', 'long', 'short', 'narrow']).optional(),
  day: z.enum(['numeric', '2-digit']).optional(),
  hour_cycle: z.enum(['h11', 'h12', 'h23', 'h24']).optional(),
});
type FormatConfig = z.infer<typeof formatSchema>;

const formatsConfig = readConfig(
  'ui/date-formats',
  z.strictObject({
    date_formats: z.record(z.string(), formatSchema).refine((formats) => 'auto' in formats),
    time_formats: z.record(z.string(), formatSchema).refine((formats) => 'auto' in formats),
  }),
);

export const DATE_FORMAT_IDS = Object.keys(formatsConfig.date_formats) as [string, ...string[]];
export const TIME_FORMAT_IDS = Object.keys(formatsConfig.time_formats) as [string, ...string[]];

/** The label message key of a format, for the settings list. */
export function dateFormatLabelKey(kind: 'date' | 'time', id: string): MessageKey {
  const formats = kind === 'date' ? formatsConfig.date_formats : formatsConfig.time_formats;
  return (formats[id] ?? formats.auto).label;
}

let current = { date: 'auto', time: 'auto' };

/** Applies the user's choice; returns whether it changed, so pages show dates again. */
export function setDateTimeFormatChoice(date: string, time: string): boolean {
  if (current.date === date && current.time === time) return false;
  current = { date, time };
  return true;
}

function dateOptions(config: FormatConfig): Intl.DateTimeFormatOptions {
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
  choice: { date: string; time: string } = current,
): { locale?: string; options: Intl.DateTimeFormatOptions } {
  const date = formatsConfig.date_formats[choice.date] ?? formatsConfig.date_formats.auto;
  const time = formatsConfig.time_formats[choice.time] ?? formatsConfig.time_formats.auto;
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    ...(kind === 'dateTime' ? { second: '2-digit' } : {}),
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
              timeStyle: 'medium' as const,
              ...(time.hour_cycle ? { hourCycle: time.hour_cycle } : {}),
            }
          : { ...day, ...timeOptions };
  // The pinned locale orders the date; a time alone follows the language.
  return { ...(date.locale && kind !== 'time' ? { locale: date.locale } : {}), options };
}
