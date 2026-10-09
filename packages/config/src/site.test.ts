/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SCREENSHOTS } from "./screenshots";
import { createSite, joinUrl, titleTemplate, withSiteName } from "./site";
import { findConfigDir, parseProjectConfig, parseWebConfig, readWorkspaceConfig } from "./workspace";

// Fixture values on purpose: the expectations below are written out by hand, so a builder
// that changes a URL shape fails here instead of silently changing every page.
const PROJECT = `
[project]
name = "Example"
slug = "example"
description = "An example."

[author]
name = "someone"
url = "https://example.org/someone"

[repository]
url = "https://github.com/owner/repo"
default_branch = "trunk"

[license]
spdx = "MIT"
url = "https://opensource.org/license/mit"
file = "LICENSE.txt"

[locales]
default = "en"
supported = ["en", "ja"]
extension = ["en", "ja", "zh-CN"]

[locales.names]
en = "English"
ja = "日本語"

[locales.og]
en = "en_US"
ja = "ja_JP"

[browsers]
supported = ["chrome", "firefox"]

[browsers.names]
chrome = "Chrome"
firefox = "Firefox"

[stores.chrome]
name = "Chrome Web Store"
url = "https://chromewebstore.google.com/detail/example"

[stores.firefox]
name = "Firefox Add-ons"
url = ""

[contact]
privacy = "privacy@example.com"
security = "security@example.com"
support = "support@example.com"

[legal]
privacy_effective_date = "2026-01-31"

[offer]
price = "0"
currency = "USD"
`;

const WEB = `
[website]
url = "https://example.com"
domains = ["example.com"]

[website.analytics]
enabled = false
provider = "umami"
script_url = "https://analytics.example.net/script.js"
website_id = ""
about_url = "https://analytics.example.net/"
metrics_url = "https://analytics.example.net/docs"

[website.theme]
light = "#ffffff"
dark = "#000000"
accent = "#123456"

[hosting]
privacy_url = "https://host.example.net/privacy"

[docs]
name = "Example Docs"
url = "https://docs.example.com"
description = "Docs."

[docs.sitemap]
change_frequency = "weekly"
home_priority = 1.0
page_priority = 0.8

[security_txt]
expires = "2030-01-01T00:00:00.000Z"
warn_days = 30
`;

const site = createSite(parseProjectConfig(PROJECT), parseWebConfig(WEB));

describe("site.url", () => {
	test("builds localized paths and absolute page URLs with a trailing slash", () => {
		expect(site.url.path("en")).toBe("/en/");
		expect(site.url.path("ja", "/privacy")).toBe("/ja/privacy/");
		expect(site.url.path("en", "", "features")).toBe("/en/#features");
		expect(site.url.page("ja", "/support")).toBe("https://example.com/ja/support/");
		expect(site.url.page("en")).toBe("https://example.com/en/");
	});

	test("lists one alternate per locale plus x-default", () => {
		expect(site.url.alternates("/privacy")).toEqual({
			en: "https://example.com/en/privacy/",
			ja: "https://example.com/ja/privacy/",
			"x-default": "https://example.com/en/privacy/",
		});
	});

	test("rejects unknown locales and malformed routes", () => {
		expect(() => site.url.page("fr")).toThrow(/Unknown locale/);
		expect(() => site.url.page("en", "privacy")).toThrow(/Invalid route/);
		expect(() => site.url.page("en", "/privacy/")).toThrow(/Invalid route/);
	});

	test("builds asset URLs on the origin", () => {
		expect(site.url.asset("/icon.png")).toBe("https://example.com/icon.png");
		expect(site.securityTxt.url).toBe("https://example.com/.well-known/security.txt");
	});
});

describe("site.repo", () => {
	test("builds repository URLs on the default branch", () => {
		expect(site.repo.slug).toBe("owner/repo");
		expect(site.repo.url()).toBe("https://github.com/owner/repo");
		expect(site.repo.url("/issues")).toBe("https://github.com/owner/repo/issues");
		expect(site.repo.url("#readme")).toBe("https://github.com/owner/repo#readme");
		expect(site.repo.file("SECURITY.md")).toBe("https://github.com/owner/repo/blob/trunk/SECURITY.md");
		expect(site.repo.tree("/store")).toBe("https://github.com/owner/repo/tree/trunk/store");
		expect(site.repo.raw("a/b.png")).toBe("https://raw.githubusercontent.com/owner/repo/trunk/a/b.png");
		expect(site.repo.releasesLatest).toBe("https://github.com/owner/repo/releases/latest");
		expect(site.repo.newIssue).toBe("https://github.com/owner/repo/issues/new/choose");
		expect(site.license.fileUrl).toBe("https://github.com/owner/repo/blob/trunk/LICENSE.txt");
	});
});

describe("site.docs, contact, stores, locales", () => {
	test("docs URLs", () => {
		expect(site.docs.url()).toBe("https://docs.example.com");
		expect(site.docs.url("/features")).toBe("https://docs.example.com/features");
		expect(site.docs.url("contributing")).toBe("https://docs.example.com/contributing");
	});

	test("contact addresses", () => {
		expect(site.contact.address("support")).toBe("support@example.com");
		expect(site.contact.mailto("security")).toBe("mailto:security@example.com");
	});

	test("store listings follow the browser order and report whether they are live", () => {
		expect(site.stores.map((store) => store.browser)).toEqual(["chrome", "firefox"]);
		expect(site.store("chrome")).toEqual({
			browser: "chrome",
			name: "Chrome Web Store",
			url: "https://chromewebstore.google.com/detail/example",
			live: true,
		});
		expect(site.store("firefox").live).toBe(false);
		expect(site.anyStoreLive).toBe(true);
		expect(() => site.store("safari")).toThrow(/Unknown browser/);
	});

	test("locale names and Open Graph codes", () => {
		expect(site.locales.name("ja")).toBe("日本語");
		expect(site.locales.ogCode("ja")).toBe("ja_JP");
		expect(site.locales.default).toBe("en");
	});
});

describe("helpers", () => {
	test("joinUrl", () => {
		expect(joinUrl("https://a.example", "")).toBe("https://a.example");
		expect(joinUrl("https://a.example", "/b")).toBe("https://a.example/b");
		expect(joinUrl("https://a.example", "b/c")).toBe("https://a.example/b/c");
		expect(joinUrl("https://a.example", "?q=1")).toBe("https://a.example?q=1");
	});

	test("title template", () => {
		expect(titleTemplate("Site")).toBe("%s | Site");
		expect(withSiteName("Privacy", "Site")).toBe("Privacy | Site");
	});
});

describe("strict loading", () => {
	test("rejects unknown keys and missing values", () => {
		const broken = PROJECT.replace('slug = "example"', 'slg = "example"');
		expect(() => parseProjectConfig(broken)).toThrow(/project\.slg: unknown key[\s\S]*project\.slug: missing/);
	});

	test("rejects a default locale that is not supported", () => {
		expect(() => parseProjectConfig(PROJECT.replace('default = "en"', 'default = "ko"'))).toThrow(
			/locales\.default/,
		);
	});

	test("accepts region tags and requires the default in the extension languages too", () => {
		expect(parseProjectConfig(PROJECT).locales.extension).toEqual(["en", "ja", "zh-CN"]);
		expect(() => parseProjectConfig(PROJECT.replace(`extension = ["en", "ja", "zh-CN"]`, `extension = ["ja", "zh-CN"]`))).toThrow(
			/locales\.default: "en" is not in locales\.extension/,
		);
		expect(() => parseProjectConfig(PROJECT.replace(`"zh-CN"]`, `"zh_CN"]`))).toThrow(/locales\.extension/);
	});

	test("requires a store and a name for every supported browser", () => {
		const extraBrowser = PROJECT.replace('supported = ["chrome", "firefox"]', 'supported = ["chrome", "firefox", "edge"]');
		expect(() => parseProjectConfig(extraBrowser)).toThrow(/browsers\.names: missing edge[\s\S]*stores: missing edge/);
	});

	test("rejects base URLs with a trailing slash", () => {
		expect(() => parseWebConfig(WEB.replace('url = "https://docs.example.com"', 'url = "https://docs.example.com/"'))).toThrow(
			/docs\.url: must not end with a slash/,
		);
	});

	test("requires a website id while analytics is on", () => {
		expect(() => parseWebConfig(WEB.replace("enabled = false", "enabled = true"))).toThrow(/website_id/);
	});

	test("the repository's own config files are valid", () => {
		const config = readWorkspaceConfig();
		expect(config.project.locales.supported).toContain(config.project.locales.default);
	});
});

describe("screenshots", () => {
	// Both sites serve the captures from their own public/ folder; the copies must not drift.
	test("every capture exists, byte for byte, in the website and docs public folders", () => {
		const root = join(findConfigDir(), "..");
		for (const pair of Object.values(SCREENSHOTS)) {
			for (const path of [pair.light, pair.dark]) {
				const website = readFileSync(join(root, "apps/website/public", path));
				const docs = readFileSync(join(root, "apps/docs/public", path));
				expect(docs.equals(website), path).toBe(true);
			}
		}
	});
});

describe("theme colors", () => {
	// The browser UI colors in config/web.toml must match the CSS tokens of both sites.
	test("match the paper and teal tokens in the website and docs stylesheets", () => {
		const root = join(findConfigDir(), "..");
		const { theme } = readWorkspaceConfig().web.website;
		const sheets = [
			readFileSync(join(root, "apps/website/app/globals.css"), "utf8"),
			readFileSync(join(root, "apps/docs/src/app/global.css"), "utf8"),
		];
		for (const css of sheets) {
			const lower = css.toLowerCase();
			for (const value of [theme.light, theme.dark, theme.accent]) {
				expect(lower).toContain(value.toLowerCase());
			}
		}
	});
});
