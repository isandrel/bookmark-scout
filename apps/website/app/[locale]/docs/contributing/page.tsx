import { MetaRedirect } from "@/components/site/MetaRedirect";
import { DOCS_NAME, DOCS_URL } from "@bookmark-scout/config";
import { setRequestLocale } from "next-intl/server";

// Superseded by the docs site; kept so old links still land somewhere useful.
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <MetaRedirect to={`${DOCS_URL}/contributing`} label={DOCS_NAME} />;
}
