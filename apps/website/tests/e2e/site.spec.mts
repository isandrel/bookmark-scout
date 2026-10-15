import { expect, test as base } from "@playwright/test";
import { site } from "@bookmark-scout/config";
import { LEGACY_DOCS_REDIRECTS } from "../../lib/content/docs-redirects";
import { INDEXABLE_ROUTES } from "../../lib/content/routes";
import { LANGUAGE_CHOICE_KEY } from "../../lib/language-preference";

// Expected URLs are spelled out from raw config values, not the site model's builders.
const SITE_URL = site.url.origin;
const DOCS_URL = site.docs.origin;
const LOCALES = site.locales.supported;
const DEFAULT_LOCALE = site.locales.default;
const analyticsHost = site.analytics.enabled ? new URL(site.analytics.scriptUrl).host : "";

/** The default language has no prefix (`/privacy/`); the others do (`/ja/privacy/`). */
const pagePath = (locale: string, route = "") =>
    locale === DEFAULT_LOCALE ? `${route}/` : `/${locale}${route}/`;

/** Opens the header's language links: the dropdown on desktop, the Menu on mobile. */
async function openLanguageLinks(page: import("@playwright/test").Page) {
    // Client-side navigation needs the router hydrated before the click.
    await page.waitForLoadState("networkidle");
    const menu = page.locator("header details summary:visible").first();
    if (await menu.isVisible()) await menu.click();
}

type Watched = { errors: string[]; thirdParty: string[] };

/**
 * Every test runs offline: analytics is stubbed, other third-party requests are
 * blocked and recorded, and console errors are collected.
 */
const test = base.extend<{ watched: Watched }>({
    watched: [
        async ({ page }, use) => {
            const watched: Watched = { errors: [], thirdParty: [] };
            page.on("console", (message) => {
                if (message.type() === "error") watched.errors.push(message.text());
            });
            page.on("pageerror", (error) => watched.errors.push(error.message));
            await page.route("**/*", (route) => {
                const url = new URL(route.request().url());
                if (url.hostname === "localhost") return route.continue();
                if (url.host === analyticsHost) return route.fulfill({ status: 204, body: "" });
                watched.thirdParty.push(url.href);
                return route.abort();
            });
            await use(watched);
        },
        { auto: true },
    ],
});

for (const locale of LOCALES) {
    for (const route of INDEXABLE_ROUTES) {
        const path = pagePath(locale, route);

        test(`${path} renders cleanly`, async ({ page, watched }) => {
            await page.goto(path);

            await expect(page.locator("html")).toHaveAttribute("lang", locale);
            await expect(page.locator("main#main")).toBeVisible();
            await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
            await expect(page.locator(`link[rel="canonical"]`)).toHaveAttribute(
                "href",
                `${SITE_URL}${path}`,
            );

            const overflow = await page.evaluate(
                () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
            );
            expect(overflow, "no horizontal scroll").toBeLessThanOrEqual(0);

            await page.waitForLoadState("networkidle");
            expect(watched.errors, "console errors").toEqual([]);
            expect(watched.thirdParty, "third-party requests").toEqual([]);
        });
    }
}

test("skip link moves focus to the main content", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard flow");
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.locator('a[href="#main"]');
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
});

test("language links keep the current page, with no prefix for the default language", async ({ page }) => {
    await page.goto("/privacy/");
    await openLanguageLinks(page);
    await page.locator('header a[hreflang="ja"]:visible').first().click();
    await expect(page).toHaveURL(/\/ja\/privacy\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");

    await openLanguageLinks(page);
    await page.locator(`header a[hreflang="${DEFAULT_LOCALE}"]:visible`).first().click();
    await expect(page).toHaveURL((url) => url.pathname === "/privacy/");
    await expect(page.locator("html")).toHaveAttribute("lang", DEFAULT_LOCALE);
});

test("language links point to every language's copy of the page", async ({ page }) => {
    for (const from of ["/support/", "/ja/support/", "/"]) {
        await page.goto(from);
        const route = from.replace(/^\/ja\//, "/").replace(/\/$/, "");
        for (const locale of LOCALES) {
            await expect(page.locator(`header a[hreflang="${locale}"]`).first()).toHaveAttribute(
                "href",
                pagePath(locale, route),
            );
        }
    }
});

test("hero demo saves the page to a folder found by name", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const input = page.getByRole("combobox", { name: "Try it: save this page to a folder" });
    const options = page.getByRole("listbox", { name: "Save to folder" }).getByRole("option");
    await input.fill("zzzz-no-such-folder");
    await expect(options).toHaveCount(0);

    // A path and a typo both find the folder; the first match is selected.
    await input.fill("travel/japan");
    await expect(options.first()).toContainText("Japan");
    await input.fill("reserch");
    await expect(options.first()).toContainText("Research");

    await input.fill("pas");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    await input.press("Enter");
    await expect(page.getByText("Saved to Recipes / Pasta.")).toBeVisible();
    await options.first().click();
    await expect(page.getByText("Already in Recipes / Pasta, so it was not saved twice.")).toBeVisible();
});

test("tabs follow the ARIA tabs pattern", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard flow");
    await page.goto("/");
    const tablist = page.getByRole("tablist").first();
    const tabs = tablist.getByRole("tab");
    await tabs.first().click();
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(tabs.nth(1)).toBeFocused();
    await expect(page.getByRole("tabpanel").first()).toBeVisible();
});

test("store-required pages publish the contact addresses", async ({ page }) => {
    await page.goto("/privacy/");
    await expect(page.locator(`main a[href="mailto:${site.contact.address("privacy")}"]`).first()).toBeVisible();
    await page.goto("/support/");
    await expect(page.locator(`main a[href="mailto:${site.contact.address("support")}"]`).first()).toBeVisible();
});

test("legacy docs pages move permanently to the docs site", async ({ request }) => {
    for (const locale of LOCALES) {
        for (const [path, target] of Object.entries(LEGACY_DOCS_REDIRECTS)) {
            const url = `/${locale}/docs/${path ? `${path}/` : ""}`;
            const response = await request.get(url, { maxRedirects: 0 });
            expect(response.status(), url).toBe(301);
            expect(response.headers().location, url).toBe(`${DOCS_URL}${target}`);
        }
    }
    const missing = await request.get(`/${DEFAULT_LOCALE}/docs/no-such-page/`);
    expect(missing.status()).toBe(404);
});

test("old default-language URLs move permanently to unprefixed ones", async ({ request, baseURL }) => {
    const cases: [string, string][] = [
        [`/${DEFAULT_LOCALE}`, "/"],
        [`/${DEFAULT_LOCALE}/`, "/"],
        ...INDEXABLE_ROUTES.map((route): [string, string] => [`/${DEFAULT_LOCALE}${route}/`, `${route}/`]),
    ];
    for (const [from, to] of cases) {
        const response = await request.get(from, { maxRedirects: 0 });
        expect(response.status(), from).toBe(301);
        expect(new URL(response.headers().location ?? "", baseURL).pathname, from).toBe(to);
    }
});

test("the root page is the default-language home, with no redirect", async ({ page, request }) => {
    const response = await request.get("/", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(await response.text()).not.toContain('http-equiv="refresh"');
    await page.goto("/");
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator("html")).toHaveAttribute("lang", DEFAULT_LOCALE);
});

test("no language suggestion when the browser language is the page's", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("aside[lang]")).toHaveCount(0);
});

test.describe("language suggestion for a Japanese browser", () => {
    test.use({ locale: "ja-JP" });

    const banner = (page: import("@playwright/test").Page) => page.locator('aside[lang="ja"]');

    test("offers the same page in Japanese without redirecting", async ({ page }) => {
        await page.goto("/privacy/");
        await expect(banner(page)).toBeVisible();
        expect(new URL(page.url()).pathname).toBe("/privacy/");
        await expect(page.locator("html")).toHaveAttribute("lang", DEFAULT_LOCALE);
        const close = banner(page).getByRole("button");
        await expect(close).toHaveAccessibleName(/.+/);
        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, "no horizontal scroll").toBeLessThanOrEqual(0);

        await banner(page).getByRole("link").click();
        await expect(page).toHaveURL(/\/ja\/privacy\/$/);
        await expect(page.locator("html")).toHaveAttribute("lang", "ja");
        await expect(page.locator("aside[lang]")).toHaveCount(0);
    });

    test("is not shown on the Japanese page", async ({ page }) => {
        await page.goto("/ja/");
        await page.waitForLoadState("networkidle");
        await expect(page.locator("aside[lang]")).toHaveCount(0);
    });

    test("stays dismissed after closing it", async ({ page }) => {
        await page.goto("/");
        await banner(page).getByRole("button").click();
        await expect(banner(page)).toHaveCount(0);
        expect(await page.evaluate((key) => localStorage.getItem(key), LANGUAGE_CHOICE_KEY)).toBe(DEFAULT_LOCALE);
        await page.reload();
        await page.waitForLoadState("networkidle");
        await expect(banner(page)).toHaveCount(0);
    });

    test("closes with Escape", async ({ page, isMobile }) => {
        test.skip(isMobile, "keyboard flow");
        await page.goto("/");
        await banner(page).getByRole("link").focus();
        await page.keyboard.press("Escape");
        await expect(banner(page)).toHaveCount(0);
    });

    test("stays hidden after picking a language in the header", async ({ page }) => {
        await page.goto("/support/");
        await expect(banner(page)).toBeVisible();
        await openLanguageLinks(page);
        await page.locator(`header a[hreflang="${DEFAULT_LOCALE}"]:visible`).first().click();
        await expect(banner(page)).toHaveCount(0);
        await page.reload();
        await page.waitForLoadState("networkidle");
        await expect(banner(page)).toHaveCount(0);
    });
});

test("install buttons go straight to the live store listing, with manual steps folded away", async ({ page }) => {
    const live = site.stores.find((store) => store.live);
    test.skip(!live, "no store listing is live");
    await page.goto("/");
    await expect(page.locator(`section[aria-labelledby="hero-title"] a[href="${live?.url}"]`)).toBeVisible();
    // One button per live listing; browsers without one are "coming soon", never sent elsewhere.
    await expect(page.locator(`#install a[href="${live?.url}"]`)).toHaveCount(1);
    const manual = page.locator("#install-by-hand");
    expect(await manual.getAttribute("open")).toBeNull();
    await manual.locator("summary").click();
    await expect(manual.getByRole("tablist")).toBeVisible();
});

test("tour screenshots load as AVIF or WebP at a fitting width", async ({ page }) => {
    await page.goto("/");
    const image = page.locator("#features picture img").first();
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const currentSrc = await image.evaluate((img: HTMLImageElement) => img.currentSrc);
    expect(currentSrc).toMatch(/\/optimized\/.+-(640|960|1280)\.(avif|webp)$/);
});
