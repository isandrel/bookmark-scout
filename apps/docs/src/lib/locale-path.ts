/**
 * How a docs URL names its language: the default language has no prefix (`/faq`), every other
 * language starts with its tag (`/ja/faq`). Imports nothing, so client components can use it;
 * the server passes the language list in from config (`src/lib/i18n.ts`).
 */
export type LocaleRouting = {
  defaultLocale: string;
  locales: readonly string[];
};

/** Splits route segments into the page's language and its slugs within that language. */
export function splitLocale(
  segments: readonly string[],
  routing: LocaleRouting,
): { locale: string; slugs: string[] } {
  const [first, ...rest] = segments;
  if (
    first !== undefined &&
    first !== routing.defaultLocale &&
    routing.locales.includes(first)
  ) {
    return { locale: first, slugs: rest };
  }
  return { locale: routing.defaultLocale, slugs: [...segments] };
}

/** The language of a URL path such as `/ko/guides/search`. */
export function localeOfPath(pathname: string, routing: LocaleRouting): string {
  return splitLocale(pathname.split("/").filter(Boolean), routing).locale;
}

/** Route segments for a page: the language prefix (none for the default language), then its slugs. */
export function localizedSegments(
  locale: string,
  slugs: readonly string[],
  routing: LocaleRouting,
): string[] {
  return locale === routing.defaultLocale ? [...slugs] : [locale, ...slugs];
}
