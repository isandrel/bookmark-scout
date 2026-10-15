import { Faq } from "@/components/home/Faq";
import { Hero } from "@/components/home/Hero";
import { Install } from "@/components/home/Install";
import { PrivacyBoundary } from "@/components/home/PrivacyBoundary";
import { Tour } from "@/components/home/Tour";
import { setRequestLocale } from "next-intl/server";

/** The home page in one language; its metadata comes from the site layout. */
export function HomePage({ locale }: { locale: string }) {
    setRequestLocale(locale);

    return (
        <>
            <Hero locale={locale} />
            <Tour locale={locale} />
            <PrivacyBoundary locale={locale} />
            <Install locale={locale} />
            <Faq locale={locale} />
        </>
    );
}
