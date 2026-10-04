import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	badgeText,
	browserBadges,
	installedVersion,
	parseVersionArgument,
	readmeValues,
	releaseLine,
	render,
} from "./generate-readme";

const context = {
	values: { SITE_NAME: "Example" },
	version: (name: string) => ({ react: "19.3.0", wxt: "0.21.4" })[name] ?? "1.0.0",
	browserBadges: (label: string) => `<badges ${label}>`,
};

describe("render", () => {
	test("fills values, versions, and browser badges", () => {
		expect(render("{{SITE_NAME}} {{VERSION:react}} {{VERSION:wxt}} {{BROWSER_BADGES:Supported}}", context)).toBe(
			"Example 19 0.21 <badges Supported>",
		);
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

test("badgeText escapes shields.io separators", () => {
	expect(badgeText("AGPL-3.0")).toBe("AGPL--3.0");
	expect(badgeText("Not Supported")).toBe("Not%20Supported");
});

test("every template renders with the repository config and installed packages", () => {
	const templatesDir = join(import.meta.dir, "..", "templates");
	const real = {
		values: readmeValues(),
		version: (name: string, workspace?: string) => installedVersion(name, undefined, workspace),
		browserBadges: (label: string) => browserBadges(label),
	};
	for (const file of readdirSync(templatesDir).filter((name) => name.endsWith(".md"))) {
		const output = render(readFileSync(join(templatesDir, file), "utf8"), real, file);
		expect(output).not.toContain("{{");
	}
});
