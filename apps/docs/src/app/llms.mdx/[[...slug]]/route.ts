import { notFound } from "next/navigation";
import {
  docsLlms,
  getPageForRoute,
  getPageMarkdownUrl,
  getTranslatedPages,
} from "@/lib/source";

export const revalidate = false;

// Serves `/llms.mdx/<page slug>/content.md` (`/llms.mdx/<language>/<page slug>/content.md` for a
// translation), the Markdown behind each page's copy and "open in" actions. The trailing
// `content.md` segment gives the static export a file name. A page without a translation points
// to the English copy, so only pages with their own file get one.
export async function GET(
  _req: Request,
  { params }: RouteContext<"/llms.mdx/[[...slug]]">,
) {
  const { slug = [] } = await params;
  const page = getPageForRoute(slug.slice(0, -1));
  if (!page) notFound();

  return new Response(await docsLlms.page(page), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

export function generateStaticParams() {
  return getTranslatedPages().map((page) => ({
    slug: getPageMarkdownUrl(page).segments,
  }));
}
