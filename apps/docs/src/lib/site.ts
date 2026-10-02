import { SITE_NAME, SITE_URL } from "@bookmark-scout/config";
import type { LinkItemType } from "fumadocs-ui/layouts/shared";

export const DOCS_DESCRIPTION =
  "Install and use Bookmark Scout, a browser extension that searches, organizes, and cleans up your bookmarks inside your browser.";

export const NAV_TITLE = SITE_NAME;

/** Header links. GitHub is added by the layout's `githubUrl` option. */
export const NAV_LINKS: LinkItemType[] = [
  { text: "Website", url: SITE_URL, external: true },
];

/** Browser UI colors; match the paper background tokens in app/global.css. */
export const THEME_COLORS = { light: "#f4f7fb", dark: "#0d1b2a" } as const;
