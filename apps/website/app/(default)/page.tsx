import { HomePage } from "@/components/pages/HomePage";
import { routing } from "@/i18n/routing";

export default function Home() {
    return <HomePage locale={routing.defaultLocale} />;
}
