/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { site } from "@bookmark-scout/config";
import { redirectsFile } from "../scripts/generate-public-files";
import { formatRedirects, matchRedirect, parseRedirects } from "./redirects";

describe("redirect rules", () => {
    test("format and parse round-trip", () => {
        const rules = [
            { from: "/a", to: "/b", status: 301 as const },
            { from: "/old/*", to: "/:splat", status: 301 as const },
        ];
        expect(parseRedirects(formatRedirects(rules, ["comment"]))).toEqual(rules);
    });

    test("exact rules win over the splat, and the splat keeps the rest of the path", () => {
        const rules = parseRedirects(`
            /en/*            /:splat                  301
            /en/docs/        https://docs.example/    301
        `);
        expect(matchRedirect(rules, "/en/docs/")).toEqual({ location: "https://docs.example/", status: 301 });
        expect(matchRedirect(rules, "/en/privacy/")).toEqual({ location: "/privacy/", status: 301 });
        expect(matchRedirect(rules, "/en/")).toEqual({ location: "/", status: 301 });
        expect(matchRedirect(rules, "/ja/")).toBeUndefined();
    });
});

describe("the generated _redirects", () => {
    // Expected URLs are spelled out from raw config values, not the site model's builders.
    const rules = parseRedirects(redirectsFile());
    const docs = site.docs.origin;
    const old = site.locales.default;

    test("moves the default language's old prefix to unprefixed URLs", () => {
        expect(matchRedirect(rules, `/${old}`)).toEqual({ location: "/", status: 301 });
        expect(matchRedirect(rules, `/${old}/`)).toEqual({ location: "/", status: 301 });
        expect(matchRedirect(rules, `/${old}/privacy/`)).toEqual({ location: "/privacy/", status: 301 });
        expect(matchRedirect(rules, `/${old}/support/`)).toEqual({ location: "/support/", status: 301 });
    });

    test("sends the old website docs pages to the docs site in every language", () => {
        for (const locale of site.locales.supported) {
            expect(matchRedirect(rules, `/${locale}/docs/`)?.location).toBe(`${docs}/`);
            expect(matchRedirect(rules, `/${locale}/docs/features`)?.location).toBe(`${docs}/features`);
            expect(matchRedirect(rules, `/${locale}/docs/features/`)?.location).toBe(`${docs}/features`);
        }
    });

    test("never redirects the home page or other languages", () => {
        expect(matchRedirect(rules, "/")).toBeUndefined();
        expect(matchRedirect(rules, "/privacy/")).toBeUndefined();
        for (const locale of site.locales.supported.filter((tag) => tag !== old)) {
            expect(matchRedirect(rules, `/${locale}/`)).toBeUndefined();
            expect(matchRedirect(rules, `/${locale}/privacy/`)).toBeUndefined();
        }
    });

    test("stays within Cloudflare Pages' limits", () => {
        expect(rules.filter((rule) => rule.from.includes("*")).length).toBeLessThanOrEqual(100);
        expect(rules.length).toBeLessThanOrEqual(2000);
    });
});
