"use client";

import type * as PageTree from "fumadocs-core/page-tree";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { LinkItemType } from "fumadocs-ui/layouts/shared";
import { RootProvider } from "fumadocs-ui/provider/next";
import { usePathname } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { type LocaleRouting, localeOfPath } from "@/lib/locale-path";

/** Everything in the shell that differs by language. */
export type LanguageShell = {
  tree: PageTree.Root;
  links: LinkItemType[];
  i18n: NonNullable<ComponentProps<typeof RootProvider>["i18n"]>;
  /** URL of the language's static search index. */
  searchApi: string;
};

type DocsShellProps = {
  routing: LocaleRouting;
  /** One entry per language tag. */
  languages: Record<string, LanguageShell>;
  className: string;
  navTitle: ReactNode;
  githubUrl: string;
  children: ReactNode;
};

/**
 * The document shell: `<html lang>`, the providers, and the docs layout, in the language of the
 * current URL. English URLs have no language prefix, so the language cannot be a route segment
 * of the root layout; reading it from the path keeps one root layout, so the sidebar stays
 * mounted while the reader moves between pages. Static export renders each page with its own
 * path, so the exported HTML already carries the right `lang`.
 */
export function DocsShell({
  routing,
  languages,
  className,
  navTitle,
  githubUrl,
  children,
}: DocsShellProps) {
  const locale = localeOfPath(usePathname(), routing);
  const shell = languages[locale] ?? languages[routing.defaultLocale];
  if (!shell) throw new Error(`No docs shell for language "${locale}"`);

  return (
    <html lang={locale} className={className} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col font-sans">
        <RootProvider
          search={{ options: { type: "static", api: shell.searchApi } }}
          i18n={shell.i18n}
        >
          <DocsLayout
            tree={shell.tree}
            nav={{ title: navTitle }}
            links={shell.links}
            githubUrl={githubUrl}
          >
            {children}
          </DocsLayout>
        </RootProvider>
      </body>
    </html>
  );
}
