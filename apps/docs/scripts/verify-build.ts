/// <reference types="bun" />
/**
 * Checks the docs static export in `out/` for the URL, SEO, and LLM-text guarantees the
 * site depends on. Run after `next build`:
 *
 *   bun run verify
 *
 * Exits non-zero and lists every failure.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { site, TITLE_SEPARATOR } from "@bookmark-scout/config";

// Raw config values; the expected URLs below are spelled out rather than built by the site model.
const DOCS_NAME = site.docs.name;
const DOCS_URL = site.docs.origin;

const outDir = join(resolve(import.meta.dir, ".."), "out");

/** URLs published before the docs were restructured. They must keep working. */
const LEGACY_PATHS = [
  "/",
  "/installation",
  "/features",
  "/status",
  "/contributing",
] as const;

/** Plain-text files for LLMs that must exist and have content. */
const LLM_FILES = ["llms.txt", "llms-full.txt"] as const;

/** Attribute values that load or link something; a local address there is a leaked dev URL. */
const URL_ATTRIBUTE = /\s(?:href|src|srcset|content|action|poster)="([^"]*)"/g;
const LOCAL_HOST = /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)\b/;

const failures: string[] = [];
const fail = (message: string) => failures.push(message);

function readOut(relativePath: string): string | undefined {
  const file = join(outDir, relativePath);
  return existsSync(file) ? readFileSync(file, "utf8") : undefined;
}

/** The exported HTML file for a site path: `/` is `index.html`, `/a/b` is `a/b.html`. */
function htmlFileFor(path: string): string | undefined {
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  const candidates = trimmed
    ? [`${trimmed}.html`, `${trimmed}/index.html`]
    : ["index.html"];
  return candidates.find((candidate) => existsSync(join(outDir, candidate)));
}

function listHtmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === "_next" ? [] : listHtmlFiles(path);
    return name.endsWith(".html") ? [path] : [];
  });
}

function decodeEntities(value: string): string {
  // Decode &amp; last so "&amp;quot;" stays "&quot;" instead of becoming '"'.
  return value
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function checkPage(path: string) {
  const file = htmlFileFor(path);
  if (!file) {
    fail(`${path}: no HTML file in out/`);
    return;
  }
  const html = readFileSync(join(outDir, file), "utf8");

  if (html.includes("__next_error__"))
    fail(`${path}: rendered as a Next.js error page`);

  const title = decodeEntities(
    /<title>([^<]*)<\/title>/.exec(html)?.[1]?.trim() ?? "",
  );
  if (
    title !== DOCS_NAME &&
    !title.endsWith(`${TITLE_SEPARATOR}${DOCS_NAME}`)
  ) {
    fail(
      `${path}: title "${title}" should be "${DOCS_NAME}" or end with "${TITLE_SEPARATOR}${DOCS_NAME}"`,
    );
  }

  // Next.js writes the home canonical without a trailing slash, so compare without one.
  const withoutSlash = (url: string | undefined) => url?.replace(/\/$/, "");
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
  const expected = new URL(path, DOCS_URL).toString();
  if (withoutSlash(canonical) !== withoutSlash(expected)) {
    fail(`${path}: canonical "${canonical}" should be "${expected}"`);
  }

  const ogImage = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
  if (!ogImage?.startsWith(`${DOCS_URL}/`)) {
    fail(
      `${path}: og:image "${ogImage}" should be an absolute URL on ${DOCS_URL}`,
    );
  }
}

function checkSitemap(): string[] {
  const sitemap = readOut("sitemap.xml");
  if (!sitemap) {
    fail("sitemap.xml: missing");
    return [];
  }
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => match[1] ?? "",
  );
  if (urls.length === 0) fail("sitemap.xml: lists no URLs");

  const paths: string[] = [];
  for (const url of urls) {
    if (url !== DOCS_URL && !url.startsWith(`${DOCS_URL}/`)) {
      fail(`sitemap.xml: ${url} is not on ${DOCS_URL}`);
      continue;
    }
    paths.push(new URL(url).pathname);
  }
  for (const legacy of LEGACY_PATHS) {
    if (!paths.includes(legacy))
      fail(`sitemap.xml: legacy URL ${legacy} is missing`);
  }
  return paths;
}

function checkRobots() {
  const robots = readOut("robots.txt");
  if (!robots) fail("robots.txt: missing");
  else if (!robots.includes(`Sitemap: ${DOCS_URL}/sitemap.xml`)) {
    fail(`robots.txt: should point to ${DOCS_URL}/sitemap.xml`);
  }
}

function checkLlmFiles() {
  for (const name of LLM_FILES) {
    const text = readOut(name);
    if (!text?.trim()) fail(`${name}: missing or empty`);
  }
}

function checkNoLocalUrls() {
  for (const file of listHtmlFiles(outDir)) {
    const html = readFileSync(file, "utf8");
    for (const [, value] of html.matchAll(URL_ATTRIBUTE)) {
      if (value && LOCAL_HOST.test(value)) {
        fail(`${relative(outDir, file)}: links to a local address: ${value}`);
      }
    }
  }
}

if (!existsSync(outDir)) {
  console.error(`No static export at ${outDir}. Run the docs build first.`);
  process.exit(1);
}

const sitemapPaths = checkSitemap();
for (const path of new Set([...LEGACY_PATHS, ...sitemapPaths])) checkPage(path);
checkRobots();
checkLlmFiles();
checkNoLocalUrls();

if (failures.length > 0) {
  console.error(`Docs build verification failed (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `Docs build verified: ${new Set([...LEGACY_PATHS, ...sitemapPaths]).size} pages.`,
);
