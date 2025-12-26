import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { DOCS_URL } from "@bookmark-scout/config";

export default async function DocsPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    setRequestLocale(locale);

    // Redirect to external docs site
    redirect(DOCS_URL);
}
