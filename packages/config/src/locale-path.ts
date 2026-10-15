/**
 * How a website or docs URL names its language: the default language has no prefix (`/faq`),
 * every other language starts with its tag (`/ja/faq`). Imports nothing, so client components
 * can use it through `@bookmark-scout/config/locale-path`; the server passes the language list
 * in from config (`site.locales`).
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
	if (first !== undefined && first !== routing.defaultLocale && routing.locales.includes(first)) {
		return { locale: first, slugs: rest };
	}
	return { locale: routing.defaultLocale, slugs: [...segments] };
}

/** The language of a URL path such as `/ko/guides/search`. */
export function localeOfPath(pathname: string, routing: LocaleRouting): string {
	return splitLocale(pathname.split("/").filter(Boolean), routing).locale;
}

/** Route segments for a page: the language prefix (none for the default language), then its slugs. */
export function localizedSegments(locale: string, slugs: readonly string[], routing: LocaleRouting): string[] {
	return locale === routing.defaultLocale ? [...slugs] : [locale, ...slugs];
}

/**
 * The same page in another language, such as `/ja/privacy/` to `/privacy/` for the default
 * language. A leading default-language segment (`/en/privacy/`, the old URL shape) is dropped
 * too, so a link never gains a second prefix. `trailingSlash` matches a static export that
 * serves `page/index.html`.
 */
export function pathInLocale(
	pathname: string,
	locale: string,
	routing: LocaleRouting,
	{ trailingSlash = false }: { trailingSlash?: boolean } = {},
): string {
	const segments = pathname.split("/").filter(Boolean);
	if (segments[0] === routing.defaultLocale) segments.shift();
	const { slugs } = splitLocale(segments, routing);
	const localized = localizedSegments(locale, slugs, routing);
	if (localized.length === 0) return "/";
	return `/${localized.join("/")}${trailingSlash ? "/" : ""}`;
}
