import { docs } from "fumadocs-mdx:collections/server";
import { site } from "@bookmark-scout/config";
import { type InferPageType, llms, loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import { absolutizeLinks, resolveMdxForText } from "@/lib/mdx-text";

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: "/",
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export type DocsPage = InferPageType<typeof source>;

/** Where the MDX sources live in the repository, for "view on GitHub" links. */
const CONTENT_DIR = "apps/docs/content/docs";

export function getPageImage(page: DocsPage) {
  const segments = [...page.slugs, "image.png"];

  return {
    segments,
    url: `/og/docs/${segments.join("/")}`,
  };
}

/** Static Markdown copy of a page, served by `app/llms.mdx/[[...slug]]/route.ts`. */
export function getPageMarkdownUrl(page: DocsPage) {
  const segments = [...page.slugs, "content.md"];

  return {
    segments,
    url: `/llms.mdx/${segments.join("/")}`,
  };
}

export function getPageSourceUrl(page: DocsPage): string {
  return site.repo.file(`${CONTENT_DIR}/${page.path}`);
}

export async function getLLMText(page: DocsPage): Promise<string> {
  const processed = await page.data.getText("processed");

  return `# ${page.data.title} (${new URL(page.url, site.docs.origin).toString()})

${resolveMdxForText(processed)}`;
}

export const docsLlms = llms(source, {
  renderPage: getLLMText,
});

/**
 * `llms.txt` with absolute links, so the index works when read outside this site, and
 * the sidebar sections as `##` headings, as the llms.txt format expects.
 */
export async function getLLMIndex(): Promise<string> {
  const index = await docsLlms.index();
  return absolutizeLinks(index).replace(/^- \*\*(.+)\*\*$/gm, "## $1");
}
