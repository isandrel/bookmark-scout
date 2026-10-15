import { PrivacyPage, privacyPageMetadata } from "@/components/pages/PrivacyPage";
import type { Metadata } from "next";

type PageProps = { params: Promise<{ locale: string }> };

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    return privacyPageMetadata((await params).locale);
}

export default async function Privacy({ params }: PageProps) {
    return <PrivacyPage locale={(await params).locale} />;
}
