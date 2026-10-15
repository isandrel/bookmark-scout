import { SupportPage, supportPageMetadata } from "@/components/pages/SupportPage";
import { routing } from "@/i18n/routing";
import type { Metadata } from "next";

export function generateMetadata(): Promise<Metadata> {
    return supportPageMetadata(routing.defaultLocale);
}

export default function Support() {
    return <SupportPage locale={routing.defaultLocale} />;
}
