import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/source";

// The site is a static export, so the search index is built once and searched in the browser.
export const revalidate = false;

export const { staticGET: GET } = createFromSource(source, {
  language: "english",
});
