import type { Metadata } from "next";

// These pages forward to the docs site, which is the canonical documentation.
// Keep them out of search results so they do not compete with the docs site.
export const metadata: Metadata = {
    robots: { index: false, follow: true },
    alternates: { canonical: null, languages: {} },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
    return children;
}
