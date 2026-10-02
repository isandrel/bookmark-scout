import { DOCS_NAME, DOCS_URL, GITHUB_URL, SITE_URL } from "@bookmark-scout/config";
import type { Metadata } from "next";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import { source } from "@/lib/source";
import "./global.css";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(DOCS_URL),
  title: { default: DOCS_NAME, template: `%s | ${DOCS_NAME}` },
  description:
    "Install, use, and contribute to Bookmark Scout, a browser extension for searching, organizing, and cleaning up bookmarks.",
  openGraph: { siteName: DOCS_NAME, type: "website" },
  twitter: { card: "summary_large_image" },
};

const docsOptions = {
  tree: source.pageTree,
  nav: {
    title: `🔖 ${DOCS_NAME}`,
  },
  links: [
    {
      text: "Website",
      url: SITE_URL,
    },
    {
      text: "GitHub",
      url: GITHUB_URL,
    },
  ],
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>
          <DocsLayout {...docsOptions}>{children}</DocsLayout>
        </RootProvider>
      </body>
    </html>
  );
}
