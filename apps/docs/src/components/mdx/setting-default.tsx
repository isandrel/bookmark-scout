import { readSettingDefault } from "@bookmark-scout/config";
import { DEFAULT_LOCALE } from "@/lib/i18n";

/** Milliseconds in a second, for defaults written in milliseconds and shown in seconds. */
const MS_PER_SECOND = 1000;

/** A setting's default number in the page's language, in seconds when `seconds` is set. */
export function settingDefaultText(
  path: string,
  locale: string,
  seconds = false,
): string {
  const value = readSettingDefault(path);
  if (typeof value !== "number") return String(value);
  return new Intl.NumberFormat(locale).format(
    seconds ? value / MS_PER_SECOND : value,
  );
}

/**
 * A setting's default from the extension's settings files
 * (`<SettingDefault path="behavior.links.confirm_open_above" />`), so the docs never type a
 * default by hand. `seconds` shows a default written in milliseconds in seconds; the unit is
 * the page's own text.
 */
export function SettingDefault({
  path,
  seconds = false,
  locale = DEFAULT_LOCALE,
}: {
  path: string;
  seconds?: boolean;
  locale?: string;
}) {
  return <>{settingDefaultText(path, locale, seconds)}</>;
}
