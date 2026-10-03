import { site } from "@bookmark-scout/config";
import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/source";

// The site is a static export, so the search index is built once and searched in the browser.
export const revalidate = false;

/** Orama names its stemming languages in lowercase English, such as "english". */
const language = String(
  new Intl.DisplayNames(["en"], { type: "language" }).of(site.locales.default),
).toLowerCase();

export const { staticGET: GET } = createFromSource(source, { language });
