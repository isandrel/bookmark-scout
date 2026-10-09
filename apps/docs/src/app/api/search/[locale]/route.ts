import { notFound } from "next/navigation";
import { LOCALES } from "@/lib/i18n";
import { getSearchAPI } from "@/lib/search";

// The site is a static export, so each language's search index is built once and searched in
// the browser. The search dialog loads only the index of the page's language.
export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: RouteContext<"/api/search/[locale]">,
) {
  const { locale } = await params;
  if (!LOCALES.includes(locale)) notFound();
  return getSearchAPI(locale).staticGET();
}

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}
