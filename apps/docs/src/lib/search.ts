import { findPath } from "fumadocs-core/page-tree";
import {
  type AdvancedIndex,
  createSearchAPI,
  type SearchAPI,
} from "fumadocs-core/search/server";
import { type DocsPage, source } from "@/lib/source";

/** Where the browser loads one language's search index (`app/api/search/[locale]/route.ts`). */
export function searchIndexUrl(locale: string): string {
  return `/api/search/${locale}`;
}

/** Sidebar folders above the page, as Fumadocs shows them under each search result. */
function breadcrumbs(page: DocsPage): string[] {
  const tree = source.getPageTree(page.locale);
  const path =
    findPath(
      tree.children,
      (node) => node.type === "page" && node.url === page.url,
    ) ?? [];
  return [tree.name, ...path.slice(0, -1).map((node) => node.name)].filter(
    (name): name is string => typeof name === "string" && name.length > 0,
  );
}

function buildIndex(page: DocsPage): AdvancedIndex {
  return {
    id: page.url,
    url: page.url,
    title: page.data.title,
    description: page.data.description,
    breadcrumbs: breadcrumbs(page),
    structuredData: page.data.structuredData,
  };
}

const apis = new Map<string, SearchAPI>();

/**
 * The search index of one language: its translated pages plus the English pages it falls back
 * to, under that language's URLs. One file per language keeps the download the size of one
 * language however many the docs support.
 *
 * Fumadocs' default "multilingual" tokenizer splits words with Intl.Segmenter, which also
 * segments Chinese and Japanese text written without spaces. The exported index records the
 * tokenizer, so the browser splits queries the same way. No stemming is applied.
 */
export function getSearchAPI(locale: string): SearchAPI {
  let api = apis.get(locale);
  if (!api) {
    api = createSearchAPI("advanced", {
      indexes: () => source.getPages(locale).map(buildIndex),
    });
    apis.set(locale, api);
  }
  return api;
}
