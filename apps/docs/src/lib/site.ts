import { site } from "@bookmark-scout/config";
import type { LinkItemType } from "fumadocs-ui/layouts/shared";
import { getCopy } from "@/lib/copy";
import { siteUrl } from "@/lib/links";

export const DOCS_DESCRIPTION = site.docs.description;

export const NAV_TITLE = site.name;

/** Header links in one language. GitHub is added by the layout's `githubUrl` option. */
export function navLinks(locale: string): LinkItemType[] {
  return [
    {
      text: getCopy(locale).nav.website,
      url: siteUrl("home", locale),
      external: true,
    },
  ];
}

/** Browser UI colors from config/web.toml; a test checks they match app/global.css. */
export const THEME_COLORS = site.theme;
