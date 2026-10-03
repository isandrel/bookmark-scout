import { expect, test as base } from "@playwright/test";
import { site } from "@bookmark-scout/config";
import { LEGACY_DOCS_REDIRECTS } from "../../lib/content/docs-redirects";
import { INDEXABLE_ROUTES } from "../../lib/content/routes";

// Expected URLs are spelled out from raw config values, not the site model's builders.
const SITE_URL = site.url.origin;
const DOCS_URL = site.docs.origin;
const LOCALES = site.locales.supported;
const analyticsHost = site.analytics.enabled ? new URL(site.analytics.scriptUrl).host : "";

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
        const path = `/${locale}${route}/`;

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
    await page.goto("/en/");
    await page.keyboard.press("Tab");
    const skip = page.locator('a[href="#main"]');
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
});

test("language links keep the current page", async ({ page }) => {
    await page.goto("/en/privacy/");
    // Client-side navigation needs the router hydrated before the click.
    await page.waitForLoadState("networkidle");
    const menu = page.locator("header details summary");
    if (await menu.isVisible()) await menu.click();
    await page.locator('header a[hreflang="ja"]:visible').first().click();
    await expect(page).toHaveURL(/\/ja\/privacy\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
});

test("hero search filters the sample library", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/en/");
    const search = page.locator("#main input").first();
    await search.fill("");
    await search.fill("zzzz-no-such-bookmark");
    await expect(page.locator("#main mark")).toHaveCount(0);
    await search.fill("mdn");
    await expect(page.locator("#main mark").first()).toBeVisible();
    await expect(page.locator("#main [aria-live]").first()).toContainText(/\d/);
});

test("tabs follow the ARIA tabs pattern", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard flow");
    await page.goto("/en/");
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
    await page.goto("/en/privacy/");
    await expect(page.locator(`main a[href="mailto:${site.contact.address("privacy")}"]`).first()).toBeVisible();
    await page.goto("/en/support/");
    await expect(page.locator(`main a[href="mailto:${site.contact.address("support")}"]`).first()).toBeVisible();
});

test("legacy docs pages forward to the docs site", async ({ request }) => {
    for (const locale of LOCALES) {
        for (const [path, target] of Object.entries(LEGACY_DOCS_REDIRECTS)) {
            const url = `/${locale}/docs/${path ? `${path}/` : ""}`;
            const response = await request.get(url);
            expect(response.status(), url).toBe(200);
            expect(await response.text(), url).toContain(`content="0; url=${DOCS_URL}${target}"`);
        }
    }
    const missing = await request.get("/en/docs/no-such-page/");
    expect(missing.status()).toBe(404);
});

test("root page redirects to the default locale", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/en\/$/);
});

test("tour screenshots load as AVIF or WebP at a fitting width", async ({ page }) => {
    await page.goto("/en/");
    const image = page.locator("#features picture img").first();
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const currentSrc = await image.evaluate((img: HTMLImageElement) => img.currentSrc);
    expect(currentSrc).toMatch(/\/optimized\/.+-(640|960|1280)\.(avif|webp)$/);
});
