import { SupportPage, supportPageMetadata } from "@/components/pages/SupportPage";
import type { Metadata } from "next";

type PageProps = { params: Promise<{ locale: string }> };

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    return supportPageMetadata((await params).locale);
}

export default async function Support({ params }: PageProps) {
    return <SupportPage locale={(await params).locale} />;
}
