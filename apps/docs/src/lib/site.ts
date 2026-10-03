import { site } from "@bookmark-scout/config";
import type { LinkItemType } from "fumadocs-ui/layouts/shared";
import { copy } from "@/lib/copy";

export const DOCS_DESCRIPTION = site.docs.description;

export const NAV_TITLE = site.name;

/** Header links. GitHub is added by the layout's `githubUrl` option. */
export const NAV_LINKS: LinkItemType[] = [
  { text: copy.nav.website, url: site.url.origin, external: true },
];

/** Browser UI colors from config/web.toml; a test checks they match app/global.css. */
export const THEME_COLORS = site.theme;
