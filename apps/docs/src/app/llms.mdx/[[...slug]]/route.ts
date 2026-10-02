import { notFound } from "next/navigation";
import { docsLlms, getPageMarkdownUrl, source } from "@/lib/source";

export const revalidate = false;

// Serves `/llms.mdx/<page slug>/content.md`, the Markdown behind each page's copy and
// "open in" actions. The trailing `content.md` segment gives the static export a file name.
export async function GET(
  _req: Request,
  { params }: RouteContext<"/llms.mdx/[[...slug]]">,
) {
  const { slug = [] } = await params;
  const page = source.getPage(slug.slice(0, -1));
  if (!page) notFound();

  return new Response(await docsLlms.page(page), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({
    slug: getPageMarkdownUrl(page).segments,
  }));
}
