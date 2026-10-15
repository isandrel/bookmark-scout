import { HomePage } from "@/components/pages/HomePage";

export const dynamicParams = false;

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
    return <HomePage locale={(await params).locale} />;
}
