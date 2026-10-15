import { PrivacyPage, privacyPageMetadata } from "@/components/pages/PrivacyPage";
import { routing } from "@/i18n/routing";
import type { Metadata } from "next";

export function generateMetadata(): Promise<Metadata> {
    return privacyPageMetadata(routing.defaultLocale);
}

export default function Privacy() {
    return <PrivacyPage locale={routing.defaultLocale} />;
}
