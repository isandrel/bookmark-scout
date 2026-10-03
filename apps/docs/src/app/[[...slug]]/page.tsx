import { site } from "@bookmark-scout/config";
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
import { createRelativeLink } from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getPageImage,
  getPageMarkdownUrl,
  getPageSourceUrl,
  source,
} from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";

export default async function Page(props: PageProps<"/[[...slug]]">) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const isHome = page.slugs.length === 0;
  const markdownUrl = getPageMarkdownUrl(page).url;
  const sourceUrl = getPageSourceUrl(page);
  const { lastModified } = page.data;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{isHome ? site.docs.name : page.data.title}</DocsTitle>
      <DocsDescription className="mb-0">
        {page.data.description}
      </DocsDescription>
      <div className="flex flex-row flex-wrap items-center gap-2 border-b border-fd-border pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover markdownUrl={markdownUrl} githubUrl={sourceUrl} />
      </div>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
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

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(
  props: PageProps<"/[[...slug]]">,
): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const isHome = page.slugs.length === 0;

  return {
    title: isHome ? { absolute: site.docs.name } : page.data.title,
    description: page.data.description,
    alternates: { canonical: page.url },
    openGraph: {
      title: isHome ? site.docs.name : page.data.title,
      description: page.data.description,
      url: page.url,
      images: getPageImage(page).url,
    },
  };
}
