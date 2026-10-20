import { site } from "@bookmark-scout/config";
import { getCopy } from "@/lib/copy";

export type LanguageListOptions = {
  /** Whose languages: the website's and docs' (`supported`, the default) or the extension's. */
  of?: "supported" | "extension";
  /** "and" joins the last two with this language's "and"; "or" with its "or". */
  join?: "and" | "or";
  /** Start with a capital letter, for a list that opens a sentence or a table cell. */
  capitalize?: boolean;
};

/**
 * The product's languages as one phrase in `locale`, such as "English, Simplified Chinese, …,
 * and Traditional Chinese": in the order of `[locales]` in config/project.toml, each named as
 * `languages` in that locale's copy, joined by `Intl.ListFormat`. Pages never list languages by
 * hand, so a new language or a new order reaches every page.
 */
export function languageList(
  locale: string,
  {
    of = "supported",
    join = "and",
    capitalize = false,
  }: LanguageListOptions = {},
): string {
  const names = getCopy(locale).languages;
  const tags =
    of === "extension" ? site.locales.extension : site.locales.supported;
  const text = new Intl.ListFormat(locale, {
    type: join === "or" ? "disjunction" : "conjunction",
  }).format(tags.map((tag) => names[tag] ?? tag));
  return capitalize
    ? text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
    : text;
}
