import { readSettingDefault } from "@bookmark-scout/config";
import { DEFAULT_LOCALE } from "@/lib/i18n";

/** Milliseconds in a second, for defaults written in milliseconds and shown in seconds. */
const MS_PER_SECOND = 1000;

/** A list default's items, joined the way the page's language joins a list ("a, b, and c"). */
function listParts(values: readonly unknown[], locale: string) {
  return new Intl.ListFormat(locale, { type: "conjunction" }).formatToParts(
    values.map(String),
  );
}

/**
 * A setting's default as text in the page's language, in seconds when `seconds` is set; a list
 * default's items are in backticks, as Markdown code.
 */
export function settingDefaultText(
  path: string,
  locale: string,
  seconds = false,
): string {
  const value = readSettingDefault(path);
  if (Array.isArray(value)) {
    return listParts(value, locale)
      .map((part) =>
        part.type === "element" ? `\`${part.value}\`` : part.value,
      )
      .join("");
  }
  if (typeof value !== "number") return String(value);
  return new Intl.NumberFormat(locale).format(
    seconds ? value / MS_PER_SECOND : value,
  );
}

/**
 * A setting's default from the extension's settings files
 * (`<SettingDefault path="behavior.links.confirm_open_above" />`), so the docs never type a
 * default by hand. `seconds` shows a default written in milliseconds in seconds; the unit is
 * the page's own text. A list default shows each item as code.
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
  const value = readSettingDefault(path);
  if (Array.isArray(value)) {
    return listParts(value, locale).map((part, index) =>
      part.type === "element" ? (
        // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one list never reorder.
        <code key={index}>{part.value}</code>
      ) : (
        part.value
      ),
    );
  }
  return <>{settingDefaultText(path, locale, seconds)}</>;
}
