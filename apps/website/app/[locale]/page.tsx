import { Faq } from "@/components/home/Faq";
import { Hero } from "@/components/home/Hero";
import { Install } from "@/components/home/Install";
import { PrivacyBoundary } from "@/components/home/PrivacyBoundary";
import { Tour } from "@/components/home/Tour";
import { setRequestLocale } from "next-intl/server";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);

    return (
        <>
            <Hero locale={locale} />
            <Tour />
            <PrivacyBoundary locale={locale} />
            <Install />
            <Faq locale={locale} />
        </>
    );
}
