import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { badgeText, browserBadges, installedVersion, readmeValues, releaseLine, render } from "./generate-readme";

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

	test("fails on a placeholder it cannot fill", () => {
		expect(() => render("{{SITE_NAME}} {{NOPE}}", context, "t.md")).toThrow("t.md: unknown placeholders {{NOPE}}");
	});
});

test("releaseLine keeps the major version, or 0.minor before 1.0", () => {
	expect(releaseLine("19.3.0")).toBe("19");
	expect(releaseLine("0.21.4")).toBe("0.21");
	expect(() => releaseLine("latest")).toThrow();
});

test("badgeText escapes shields.io separators", () => {
	expect(badgeText("AGPL-3.0")).toBe("AGPL--3.0");
	expect(badgeText("Not Supported")).toBe("Not%20Supported");
});

test("every template renders with the repository config and installed packages", () => {
	const templatesDir = join(import.meta.dir, "..", "templates");
	const real = {
		values: readmeValues(),
		version: (name: string) => installedVersion(name),
		browserBadges: (label: string) => browserBadges(label),
	};
	for (const file of readdirSync(templatesDir).filter((name) => name.endsWith(".md"))) {
		const output = render(readFileSync(join(templatesDir, file), "utf8"), real, file);
		expect(output).not.toContain("{{");
	}
});
