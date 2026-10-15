import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	badgeText,
	contactAddress,
	installedVersion,
	parseVersionArgument,
	releaseLine,
	render,
	repositoryContext,
	screenshotUrl,
	sitePage,
	storeBadges,
	storeLinks,
} from "./generate-readme";
import { site } from "@bookmark-scout/config";

const context = {
	values: { SITE_NAME: "Example" },
	version: (name: string) => ({ react: "19.3.0", wxt: "0.21.4" })[name] ?? "1.0.0",
	browserBadges: (label: string) => `<badges ${label}>`,
	storeBadges: (label: string) => `<stores ${label}>`,
	storeLinks: (label: string) => `<links ${label}>`,
	sitePage: (argument: string) => `<page ${argument}>`,
	contact: (role: string) => `<contact ${role}>`,
	screenshot: (argument: string) => `<shot ${argument}>`,
	shortcut: (argument: string, platform: string) => `<keys ${argument} ${platform}>`,
};

describe("render", () => {
	test("fills values, versions, and browser badges", () => {
		expect(render("{{SITE_NAME}} {{VERSION:react}} {{VERSION:wxt}} {{BROWSER_BADGES:Supported}} {{STORE_BADGES:Install}}", context)).toBe(
			"Example 19 0.21 <badges Supported> <stores Install>",
		);
	});

	test("passes page, contact, and screenshot arguments through", () => {
		expect(render("{{SITE_PAGE:en:/privacy}} {{CONTACT:support}} {{SCREENSHOT:popup:dark}}", context)).toBe(
			"<page en:/privacy> <contact support> <shot popup:dark>",
		);
	});

	test("passes shortcut ids and the platform through", () => {
		expect(render("{{SHORTCUT:commands.quick-save}} {{SHORTCUT_MAC:manager.redo#2}}", context)).toBe(
			"<keys commands.quick-save other> <keys manager.redo#2 mac>",
		);
	});

	test("prints the configured shortcut keys", () => {
		const real = repositoryContext();
		expect(real.shortcut("commands.quick-save", "other")).toMatch(/^[A-Za-z]+\+/);
		expect(() => real.shortcut("commands.nope", "other")).toThrow(/Unknown shortcut/);
	});

	test("passes a workspace-qualified version to the version lookup", () => {
		const versions: Record<string, string> = { typescript: "6.0.3", "apps/extension:typescript": "7.0.2" };
		const lookup = { ...context, version: (name: string, workspace?: string) => versions[workspace ? `${workspace}:${name}` : name] ?? "" };
		expect(render("{{VERSION:typescript}} {{VERSION:apps/extension:typescript}}", lookup)).toBe("6 7");
	});

	test("fails on a placeholder it cannot fill", () => {
		expect(() => render("{{SITE_NAME}} {{NOPE}}", context, "t.md")).toThrow("t.md: unknown placeholders {{NOPE}}");
	});
});

test("releaseLine keeps the major version, or 0.minor before 1.0", () => {
	expect(releaseLine("19.3.0")).toBe("19");
	expect(releaseLine("0.21.4")).toBe("0.21");
	expect(() => releaseLine("latest")).toThrow();
});

test("parseVersionArgument keeps scoped package names whole", () => {
	expect(parseVersionArgument("@biomejs/biome")).toEqual({ name: "@biomejs/biome" });
	expect(parseVersionArgument("apps/extension:typescript")).toEqual({ name: "typescript", workspace: "apps/extension" });
});

test("a workspace-qualified version is the one that workspace's package.json installs", () => {
	const root = join(import.meta.dir, "..");
	const manifest = JSON.parse(readFileSync(join(root, "apps/extension/package.json"), "utf8")) as {
		devDependencies: Record<string, string>;
	};
	const declaredMajor = /\d+/.exec(manifest.devDependencies.typescript ?? "")?.[0];
	expect(releaseLine(installedVersion("typescript", root, "apps/extension"))).toBe(declaredMajor);
	expect(() => installedVersion("typescript", root, "apps/nope")).toThrow('Unknown workspace "apps/nope"');
});

test("storeBadges links only live store listings, with the browser name filled in", () => {
	const badges = storeBadges("Add to @BROWSER");
	for (const store of site.stores) {
		expect(badges.includes(`href="${store.url}"`)).toBe(store.live);
		if (store.live) expect(badges).toContain(`alt="Add to ${site.browsers.name(store.browser)} (${store.name})"`);
	}
	expect(storeBadges("Install", { ...site, stores: [] })).toBe("");
});

test("storeLinks lists every browser, with its live store or the pending text", () => {
	const lines = storeLinks("soon to @STORE, see @DOCS/installation#@ID").split("\n");
	expect(lines).toHaveLength(site.browsers.supported.length);
	site.browsers.supported.forEach((browser, index) => {
		const store = site.store(browser);
		expect(lines[index]).toStartWith(`- **${site.browsers.name(browser)}**: `);
		expect(lines[index]).toEndWith(
			store.live ? `[${store.name}](${store.url})` : `soon to ${store.name}, see ${site.docs.origin}/installation#${browser}`,
		);
	});
});

test("sitePage, contactAddress, and screenshotUrl read the site model and reject unknown values", () => {
	expect(sitePage("en:/privacy")).toBe(site.url.page("en", "/privacy"));
	expect(() => sitePage("xx:/privacy")).toThrow();
	expect(contactAddress("support")).toBe(site.contact.address("support"));
	expect(() => contactAddress("sales")).toThrow('Unknown contact role "sales"');
	expect(screenshotUrl("popup:light")).toEndWith("/apps/website/public/screenshots/01-popup-light.png");
	expect(() => screenshotUrl("popup:sepia")).toThrow("Unknown screenshot");
});

test("badgeText escapes shields.io separators", () => {
	expect(badgeText("AGPL-3.0")).toBe("AGPL--3.0");
	expect(badgeText("Not Supported")).toBe("Not%20Supported");
});

test("every template renders with the repository config and installed packages", () => {
	const templatesDir = join(import.meta.dir, "..", "templates");
	const real = repositoryContext();
	for (const file of readdirSync(templatesDir).filter((name) => name.endsWith(".md"))) {
		const output = render(readFileSync(join(templatesDir, file), "utf8"), real, file);
		expect(output).not.toContain("{{");
	}
});
