import { docs } from "fumadocs-mdx:collections/server";
import { site } from "@bookmark-scout/config";
import { type InferPageType, llms, loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import { DEFAULT_LOCALE, i18n, LOCALE_ROUTING, LOCALES } from "@/lib/i18n";
import { localizedSegments, splitLocale } from "@/lib/locale-path";
import { absolutizeLinks, resolveMdxForText } from "@/lib/mdx-text";

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: "/",
  source: docs.toFumadocsSource(),
  i18n,
  plugins: [lucideIconsPlugin()],
});

export type DocsPage = InferPageType<typeof source>;

/** Where the MDX sources live in the repository, for "view on GitHub" links. */
const CONTENT_DIR = "apps/docs/content/docs";

// A top-level English page named like a language tag would share its URL with that language's home.
for (const page of source.getPages(DEFAULT_LOCALE)) {
  const first = page.slugs[0];
  if (first && first !== DEFAULT_LOCALE && LOCALES.includes(first)) {
    throw new Error(
      `Docs page ${page.path} uses the language tag "${first}" as its first URL segment; rename it.`,
    );
  }
}

/** The page for route segments such as `["ja", "guides", "search"]`, or undefined. */
export function getPageForRoute(segments: readonly string[] = []) {
  const { locale, slugs } = splitLocale(segments, LOCALE_ROUTING);
  return source.getPage(slugs, locale);
}

/** Route segments of a page's URL, with its language prefix. */
export function routeSegments(page: DocsPage): string[] {
  return localizedSegments(
    page.locale ?? DEFAULT_LOCALE,
    page.slugs,
    LOCALE_ROUTING,
  );
}

/** The default-language page with the same slugs. */
export function defaultLocalePage(page: DocsPage): DocsPage | undefined {
  return source.getPage(page.slugs, DEFAULT_LOCALE);
}

/**
 * True when the page has its own file for its language. A page without a translation is the
 * English file served under the language's URL (Fumadocs' fallback), so it shares that file's path.
 */
export function isTranslated(page: DocsPage): boolean {
  if (page.locale === undefined || page.locale === DEFAULT_LOCALE) return true;
  return defaultLocalePage(page)?.path !== page.path;
}

/** Every page that has its own content: all default-language pages plus each real translation. */
export function getTranslatedPages(): DocsPage[] {
  return source.getPages().filter(isTranslated);
}

/** The page whose content is shown: the page itself, or the English page it falls back to. */
function contentPage(page: DocsPage): DocsPage {
  return isTranslated(page) ? page : (defaultLocalePage(page) ?? page);
}

/**
 * hreflang alternates (root-relative URLs): each language with its own version of the page,
 * plus `x-default` for the English page. Undefined while only one language has the page.
 */
export function getHreflangAlternates(
  page: DocsPage,
): Record<string, string> | undefined {
  const languages: Record<string, string> = Object.fromEntries(
    LOCALES.flatMap((locale) => {
      const version = source.getPage(page.slugs, locale);
      return version && isTranslated(version) ? [[locale, version.url]] : [];
    }),
  );
  if (Object.keys(languages).length < 2) return undefined;
  const fallback = languages[DEFAULT_LOCALE];
  return fallback ? { ...languages, "x-default": fallback } : languages;
}

/** The social card. A translated page's card is still the English one (see DESIGN.md). */
export function getPageImage(page: DocsPage) {
  const segments = [...(defaultLocalePage(page) ?? page).slugs, "image.png"];

  return {
    segments,
    url: `/og/docs/${segments.join("/")}`,
  };
}

/**
 * Static Markdown copy of a page, served by `app/llms.mdx/[[...slug]]/route.ts`. A page without
 * a translation points to the English copy.
 */
export function getPageMarkdownUrl(page: DocsPage) {
  const segments = [...routeSegments(contentPage(page)), "content.md"];

  return {
    segments,
    url: `/llms.mdx/${segments.join("/")}`,
  };
}

/** The MDX file behind the page on GitHub: the translation, or the English file it falls back to. */
export function getPageSourceUrl(page: DocsPage): string {
  return site.repo.file(`${CONTENT_DIR}/${page.path}`);
}

export async function getLLMText(page: DocsPage): Promise<string> {
  const processed = await page.data.getText("processed");

  return `# ${page.data.title} (${new URL(page.url, site.docs.origin).toString()})

${resolveMdxForText(processed, page.locale)}`;
}

export const docsLlms = llms(source, {
  renderPage: getLLMText,
});

/**
 * `llms.txt` with absolute links, so the index works when read outside this site, and
 * the sidebar sections as `##` headings, as the llms.txt format expects. It lists the
 * default language only.
 */
export async function getLLMIndex(): Promise<string> {
  const index = await docsLlms.index(DEFAULT_LOCALE);
  return absolutizeLinks(index).replace(/^- \*\*(.+)\*\*$/gm, "## $1");
}

/** `llms-full.txt`: every default-language page. */
export function getLLMFullText(): Promise<string> {
  return docsLlms.full(DEFAULT_LOCALE);
}
