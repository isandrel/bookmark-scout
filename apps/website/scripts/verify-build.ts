/// <reference types="bun" />
/**
 * Checks the static export in `out/` for the SEO, localization, and privacy
 * guarantees the site depends on. Run after `next build`:
 *
 *   bun run verify
 *
 * Exits non-zero and lists every failure.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { site } from "@bookmark-scout/config";
import { LEGACY_DOCS_REDIRECTS } from "../lib/content/docs-redirects";
import { INDEXABLE_ROUTES } from "../lib/content/routes";
import { IMAGE_BYTE_BUDGET, IMAGE_FORMATS, IMAGE_SOURCE_DIRS, SCREENSHOT_WIDTHS, variantPath } from "../lib/images";

const appRoot = resolve(import.meta.dir, "..");
const outDir = join(appRoot, "out");
const messagesDir = join(appRoot, "messages");

// Raw config values only: expected URLs are spelled out below rather than taken from the
// site model's builders, so a builder bug cannot hide here.
const SITE_URL = site.url.origin;
const DOCS_URL = site.docs.origin;
const LOCALES = site.locales.supported;
const DEFAULT_LOCALE = site.locales.default;

/** Hosts the built pages may load resources from, besides the site itself. */
const allowedResourceHosts = new Set<string>(
    site.analytics.enabled ? [new URL(site.analytics.scriptUrl).host] : [],
);

/** Warn when security.txt expires within this many days. */
const securityTxtWarnDays = site.securityTxt.warnDays;

const failures: string[] = [];
const warnings: string[] = [];
const fail = (message: string) => failures.push(message);

function readOut(relativePath: string): string | undefined {
    const file = join(outDir, relativePath);
    return existsSync(file) ? readFileSync(file, "utf8") : undefined;
}

function pageUrl(locale: string, route: string): string {
    return `${SITE_URL}/${locale}${route}/`;
}

function attr(html: string, pattern: RegExp): string[] {
    return [...html.matchAll(pattern)].map((match) => match[1] ?? "");
}

function checkPage(locale: string, route: string) {
    const label = `/${locale}${route}/`;
    const html = readOut(join(locale, route, "index.html"));
    if (!html) {
        fail(`${label}: page missing from out/`);
        return;
    }

    const htmlTags = attr(html, /<html([^>]*)>/g);
    if (htmlTags.length !== 1) fail(`${label}: expected 1 <html> tag, found ${htmlTags.length}`);
    const lang = /lang="([^"]+)"/.exec(htmlTags[0] ?? "")?.[1];
    if (lang !== locale) fail(`${label}: <html lang="${lang}"> should be "${locale}"`);

    if (html.includes("__next_error__")) fail(`${label}: rendered as a Next.js error page`);
    if (html.includes("MISSING_MESSAGE")) fail(`${label}: contains MISSING_MESSAGE`);

    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1]?.trim();
    if (!title) fail(`${label}: empty <title>`);
    if (!/<meta name="description" content="[^"]+"/.test(html)) fail(`${label}: missing meta description`);

    const canonical = attr(html, /<link rel="canonical" href="([^"]+)"/g);
    if (canonical.length !== 1 || canonical[0] !== pageUrl(locale, route)) {
        fail(`${label}: canonical ${JSON.stringify(canonical)} should be ${pageUrl(locale, route)}`);
    }

    const alternates = new Map(
        [...html.matchAll(/<link rel="alternate" hrefLang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]),
    );
    for (const other of LOCALES) {
        if (alternates.get(other) !== pageUrl(other, route)) {
            fail(`${label}: hreflang ${other} should point to ${pageUrl(other, route)}`);
        }
    }
    if (alternates.get("x-default") !== pageUrl(DEFAULT_LOCALE, route)) {
        fail(`${label}: hreflang x-default should point to ${pageUrl(DEFAULT_LOCALE, route)}`);
    }

    for (const image of attr(html, /<meta property="og:image" content="([^"]+)"/g)) {
        if (!image.startsWith(SITE_URL)) fail(`${label}: og:image ${image} is not on ${SITE_URL}`);
    }

    // Privacy promise: no third-party resources except configured analytics.
    const resources = [
        ...attr(html, /<script[^>]*\ssrc="([^"]+)"/g),
        ...attr(html, /<img[^>]*\ssrc="([^"]+)"/g),
        ...attr(html, /<source[^>]*\ssrcset="([^"]+)"/gi),
        ...attr(html, /<link[^>]*rel="(?:stylesheet|preload|modulepreload)"[^>]*href="([^"]+)"/g),
    ];
    for (const resource of resources) {
        if (!/^https?:\/\//.test(resource)) continue;
        const host = new URL(resource).host;
        if (host !== new URL(SITE_URL).host && !allowedResourceHosts.has(host)) {
            fail(`${label}: loads third-party resource ${resource}`);
        }
    }
}

function checkSitemap() {
    const sitemap = readOut("sitemap.xml");
    if (!sitemap) {
        fail("sitemap.xml missing");
        return;
    }
    for (const locale of LOCALES) {
        for (const route of INDEXABLE_ROUTES) {
            const loc = pageUrl(locale, route);
            if (!sitemap.includes(`<loc>${loc}</loc>`)) fail(`sitemap.xml: missing ${loc}`);
        }
    }
    if (/<lastmod>[^<]*T\d{2}:\d{2}:\d{2}\.\d{3}Z<\/lastmod>/.test(sitemap)) {
        fail("sitemap.xml: lastmod looks like the build time; use a content date or omit it");
    }
}

/** The website's old /<locale>/docs/* pages forward to the docs site. */
function checkLegacyDocsRedirects() {
    for (const locale of LOCALES) {
        for (const [path, target] of Object.entries(LEGACY_DOCS_REDIRECTS)) {
            const label = `/${locale}/docs/${path ? `${path}/` : ""}`;
            const html = readOut(join(locale, "docs", path, "index.html"));
            const expected = `${DOCS_URL}${target}`;
            if (!html) fail(`${label}: page missing from out/`);
            else if (!html.includes(`content="0; url=${expected}"`)) fail(`${label}: should refresh to ${expected}`);
        }
    }
}

function checkManifest() {
    const manifest = readOut("manifest.webmanifest");
    if (!manifest) {
        fail("manifest.webmanifest missing from out/");
        return;
    }
    const parsed = JSON.parse(manifest) as { name?: string; theme_color?: string };
    if (parsed.name !== site.name) fail(`manifest.webmanifest: name should be ${site.name}`);
    if (parsed.theme_color !== site.theme.accent) fail(`manifest.webmanifest: theme_color should be ${site.theme.accent}`);
}

/** Every PNG source must ship AVIF and WebP variants within the byte budget. */
function checkOptimizedImages() {
    for (const dir of IMAGE_SOURCE_DIRS) {
        const sourceDir = join(outDir, dir);
        if (!existsSync(sourceDir)) continue;
        for (const file of readdirSync(sourceDir).filter((name) => name.endsWith(".png"))) {
            for (const width of SCREENSHOT_WIDTHS) {
                for (const format of IMAGE_FORMATS) {
                    const variant = variantPath(`/${dir}/${file}`, width, format);
                    const path = join(outDir, variant);
                    if (!existsSync(path)) fail(`${variant}: missing optimized image`);
                    else if (statSync(path).size > IMAGE_BYTE_BUDGET) {
                        fail(`${variant}: ${statSync(path).size} bytes exceeds ${IMAGE_BYTE_BUDGET}`);
                    }
                }
            }
        }
    }
}

/** Cloudflare Pages reads these from the output root. */
function checkHostingFiles() {
    if (!readOut("_redirects")?.includes(`/${DEFAULT_LOCALE}/`)) fail("_redirects: missing redirect to the default locale");
    if (!readOut("_headers")?.includes("X-Content-Type-Options")) fail("_headers: missing security headers");
}

function checkRootRedirect() {
    const html = readOut("index.html");
    if (!html?.includes('http-equiv="refresh"')) fail("index.html: missing meta refresh to the default locale");
}

function checkSecurityTxt() {
    const text = readOut(join(".well-known", "security.txt"));
    if (!text) {
        fail(".well-known/security.txt missing from out/");
        return;
    }
    if (!/^Contact: \S+/m.test(text)) fail("security.txt: missing Contact");
    const securityContact = `Contact: mailto:${site.contact.address("security")}`;
    if (!text.includes(securityContact)) fail(`security.txt: missing "${securityContact}"`);
    const canonical = `Canonical: ${SITE_URL}/.well-known/security.txt`;
    if (!text.includes(canonical)) fail(`security.txt: missing "${canonical}"`);
    const expires = /^Expires: (\S+)/m.exec(text)?.[1];
    const expiry = expires ? Date.parse(expires) : Number.NaN;
    if (Number.isNaN(expiry)) {
        fail("security.txt: missing or invalid Expires");
    } else if (expiry < Date.now()) {
        fail(`security.txt: expired on ${expires}`);
    } else if (expiry - Date.now() < securityTxtWarnDays * 86_400_000) {
        warnings.push(`security.txt: expires on ${expires}; renew it`);
    }
}

function flattenKeys(value: unknown, prefix = ""): string[] {
    if (Array.isArray(value)) {
        return value.flatMap((item, index) => flattenKeys(item, `${prefix}[${index}]`));
    }
    if (value && typeof value === "object") {
        return Object.entries(value).flatMap(([key, child]) =>
            flattenKeys(child, prefix ? `${prefix}.${key}` : key),
        );
    }
    return [prefix];
}

/** Every locale file must have the same keys as the default locale, including array lengths. */
function checkMessageParity(dir: string) {
    const load = (locale: string) => {
        const file = join(dir, `${locale}.json`);
        return existsSync(file) ? new Set(flattenKeys(JSON.parse(readFileSync(file, "utf8")))) : undefined;
    };
    const reference = load(DEFAULT_LOCALE);
    if (!reference) {
        fail(`${dir}: missing ${DEFAULT_LOCALE}.json`);
        return;
    }
    for (const locale of LOCALES) {
        if (locale === DEFAULT_LOCALE) continue;
        const keys = load(locale);
        if (!keys) {
            fail(`${dir}: missing ${locale}.json`);
            continue;
        }
        const missing = [...reference].filter((key) => !keys.has(key));
        const extra = [...keys].filter((key) => !reference.has(key));
        if (missing.length) fail(`${dir}/${locale}.json: missing ${missing.slice(0, 10).join(", ")}`);
        if (extra.length) fail(`${dir}/${locale}.json: extra ${extra.slice(0, 10).join(", ")}`);
    }
}

if (!existsSync(outDir)) {
    console.error("out/ not found. Run the website build first.");
    process.exit(1);
}

for (const locale of LOCALES) {
    for (const route of INDEXABLE_ROUTES) checkPage(locale, route);
}
checkSitemap();
checkLegacyDocsRedirects();
checkManifest();
checkRootRedirect();
checkHostingFiles();
checkOptimizedImages();
checkSecurityTxt();
checkMessageParity(messagesDir);
for (const entry of readdirSync(messagesDir)) {
    const dir = join(messagesDir, entry);
    if (statSync(dir).isDirectory()) checkMessageParity(dir);
}

for (const warning of warnings) console.warn(`warn: ${warning}`);
if (failures.length) {
    for (const failure of failures) console.error(`fail: ${failure}`);
    console.error(`\n${failures.length} check(s) failed.`);
    process.exit(1);
}
console.log(
    `Website build verified: ${LOCALES.length} locales x ${INDEXABLE_ROUTES.length} routes, sitemap, security.txt, message parity.`,
);
