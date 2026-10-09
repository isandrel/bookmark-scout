import { site } from "@bookmark-scout/config";
import { Callout } from "fumadocs-ui/components/callout";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  EditOnGitHub,
  MarkdownCopyButton,
  PageLastUpdate,
  ViewOptionsPopover,
} from "fumadocs-ui/layouts/docs/page";
import type defaultMdxComponents from "fumadocs-ui/mdx";
import { createRelativeLink } from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ComponentProps } from "react";
import { getCopy } from "@/lib/copy";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import {
  type DocsPage as DocsPageType,
  defaultLocalePage,
  getHreflangAlternates,
  getPageForRoute,
  getPageImage,
  getPageMarkdownUrl,
  getPageSourceUrl,
  isTranslated,
  routeSegments,
  source,
} from "@/lib/source";
import { getMDXComponents, localizedMdxComponents } from "@/mdx-components";

/**
 * Links in MDX are written as English URLs (`/guides/search`) or relative file paths. On a page
 * in another language, an English page URL opens the same page in that language.
 */
function createLocalizedLink(page: DocsPageType) {
  const RelativeLink = createRelativeLink(source, page);
  const locale = page.locale ?? DEFAULT_LOCALE;
  if (locale === DEFAULT_LOCALE) return RelativeLink;

  return function LocalizedLink({
    href,
    ...props
  }: ComponentProps<typeof defaultMdxComponents.a>) {
    const [path = "", hash] = (href ?? "").split("#", 2);
    const target = path.startsWith("/")
      ? source.getPageByUrl(path, DEFAULT_LOCALE)
      : undefined;
    const localized = target && source.getPage(target.slugs, locale);
    const resolved = localized
      ? `${localized.url}${hash ? `#${hash}` : ""}`
      : href;
    return <RelativeLink href={resolved} {...props} />;
  };
}

export default async function Page(props: PageProps<"/[[...slug]]">) {
  const params = await props.params;
  const page = getPageForRoute(params.slug);
  if (!page) notFound();

  const locale = page.locale ?? DEFAULT_LOCALE;
  const translated = isTranslated(page);
  // A page without a translation shows the English text inside the translated UI.
  const contentLang = translated ? undefined : DEFAULT_LOCALE;
  const MDX = page.data.body;
  const isHome = page.slugs.length === 0;
  const markdownUrl = getPageMarkdownUrl(page).url;
  const sourceUrl = getPageSourceUrl(page);
  const { lastModified } = page.data;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle lang={contentLang}>
        {isHome ? site.docs.name : page.data.title}
      </DocsTitle>
      <DocsDescription className="mb-0" lang={contentLang}>
        {page.data.description}
      </DocsDescription>
      <div className="flex flex-row flex-wrap items-center gap-2 border-b border-fd-border pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover markdownUrl={markdownUrl} githubUrl={sourceUrl} />
      </div>
      {translated ? null : (
        <Callout>{getCopy(locale).page.untranslated}</Callout>
      )}
      <DocsBody lang={contentLang}>
        <MDX
          components={getMDXComponents({
            ...localizedMdxComponents(locale),
            a: createLocalizedLink(page),
          })}
        />
      </DocsBody>
      {isHome ? null : (
        <div className="flex flex-row flex-wrap items-center justify-between gap-4">
          <EditOnGitHub href={sourceUrl} />
          {lastModified ? (
            <PageLastUpdate date={new Date(lastModified)} />
          ) : null}
        </div>
      )}
    </DocsPage>
  );
}

/** Every page in every language: English at its own path, other languages under `/<tag>/`. */
export async function generateStaticParams() {
  return source.getPages().map((page) => ({ slug: routeSegments(page) }));
}

export async function generateMetadata(
  props: PageProps<"/[[...slug]]">,
): Promise<Metadata> {
  const params = await props.params;
  const page = getPageForRoute(params.slug);
  if (!page) notFound();

  const translated = isTranslated(page);
  const isHome = page.slugs.length === 0;
  const title = isHome ? site.docs.name : page.data.title;
  // A page without a translation is a copy of the English page, which stays the canonical URL.
  const canonical = translated
    ? page.url
    : (defaultLocalePage(page)?.url ?? page.url);

  return {
    title: isHome ? { absolute: site.docs.name } : title,
    description: page.data.description,
    alternates: { canonical, languages: getHreflangAlternates(page) },
    openGraph: {
      title,
      description: page.data.description,
      url: canonical,
      locale: site.locales.ogCode(
        translated ? (page.locale ?? DEFAULT_LOCALE) : DEFAULT_LOCALE,
      ),
      images: getPageImage(page).url,
    },
  };
}
