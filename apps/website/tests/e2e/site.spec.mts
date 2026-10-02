import { expect, test, type Page } from "@playwright/test";
import { CONTACT, LOCALES, SITE_URL, UMAMI_SCRIPT_URL } from "@bookmark-scout/config";
import { INDEXABLE_ROUTES } from "../../lib/content/routes";

const analyticsHost = UMAMI_SCRIPT_URL ? new URL(UMAMI_SCRIPT_URL).host : "";

/** Records console errors and third-party requests; analytics is stubbed so tests stay offline. */
async function watchPage(page: Page) {
    const errors: string[] = [];
    const thirdParty: string[] = [];
    page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.hostname === "localhost") return route.continue();
        if (url.host === analyticsHost) return route.fulfill({ status: 204, body: "" });
        thirdParty.push(url.href);
        return route.abort();
    });
    return { errors, thirdParty };
}

for (const locale of LOCALES) {
    for (const route of INDEXABLE_ROUTES) {
        const path = `/${locale}${route}/`;

        test(`${path} renders cleanly`, async ({ page }) => {
            const watched = await watchPage(page);
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
    await expect(page.locator(`main a[href="mailto:${CONTACT.privacy}"]`).first()).toBeVisible();
    await page.goto("/en/support/");
    await expect(page.locator(`main a[href="mailto:${CONTACT.support}"]`).first()).toBeVisible();
});

test("root page redirects to the default locale", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/en\/$/);
});
