import { defineConfig, devices } from "@playwright/test";

/** Port for the static export server; override with WEBSITE_TEST_PORT. */
const port = Number(process.env.WEBSITE_TEST_PORT ?? 4173);

export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: true,
    retries: process.env.CI ? 1 : 0,
    timeout: 30_000,
    reporter: "line",
    outputDir: "./test-results/playwright",
    use: {
        baseURL: `http://localhost:${port}`,
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
    },
    projects: [
        { name: "desktop", use: { ...devices["Desktop Chrome"] } },
        { name: "mobile", use: { ...devices["Pixel 7"] } },
    ],
    webServer: {
        command: `bun scripts/serve-out.ts ${port}`,
        url: `http://localhost:${port}/en/`,
        reuseExistingServer: !process.env.CI,
    },
});
