import { PUBLIC_PATHS, site, titleTemplate } from "@bookmark-scout/config";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata, Viewport } from "next";
import {
  Bricolage_Grotesque,
  Instrument_Sans,
  JetBrains_Mono,
} from "next/font/google";
import Image from "next/image";
import {
  DOCS_DESCRIPTION,
  NAV_LINKS,
  NAV_TITLE,
  THEME_COLORS,
} from "@/lib/site";
import { source } from "@/lib/source";
import "./global.css";

const display = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
});

const body = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

const code = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(site.docs.origin),
  title: { default: site.docs.name, template: titleTemplate(site.docs.name) },
  description: DOCS_DESCRIPTION,
  icons: { icon: PUBLIC_PATHS.icon, apple: PUBLIC_PATHS.icon },
  openGraph: { siteName: site.docs.name, type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

function NavTitle() {
  return (
    <span className="inline-flex items-center gap-2.5 font-display text-[1.0625rem] font-bold tracking-tight">
      <Image
        src={PUBLIC_PATHS.icon}
        alt=""
        width={26}
        height={26}
        className="size-[26px]"
        priority
      />
      {NAV_TITLE}
    </span>
  );
}

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={site.locales.default}
      className={`${display.variable} ${body.variable} ${code.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col font-sans">
        <RootProvider search={{ options: { type: "static" } }}>
          <DocsLayout
            tree={source.pageTree}
            nav={{ title: <NavTitle /> }}
            links={NAV_LINKS}
            githubUrl={site.repo.url()}
          >
            {children}
          </DocsLayout>
        </RootProvider>
      </body>
    </html>
  );
}
