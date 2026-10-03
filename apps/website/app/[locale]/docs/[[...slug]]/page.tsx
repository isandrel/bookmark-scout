import { MetaRedirect } from "@/components/site/MetaRedirect";
import { LEGACY_DOCS_REDIRECTS } from "@/lib/content/docs-redirects";
import { site } from "@bookmark-scout/config";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

type PageProps = { params: Promise<{ locale: string; slug?: string[] }> };

export const dynamicParams = false;

export function generateStaticParams() {
    return Object.keys(LEGACY_DOCS_REDIRECTS).map((path) => ({ slug: path ? path.split("/") : [] }));
}

/** Superseded by the docs site; each legacy path forwards to its docs page. */
export default async function LegacyDocsRedirect({ params }: PageProps) {
    const { locale, slug = [] } = await params;
    setRequestLocale(locale);
    const target = LEGACY_DOCS_REDIRECTS[slug.join("/")];
    if (target === undefined) notFound();
    return <MetaRedirect to={site.docs.url(target)} label={site.docs.name} />;
}
