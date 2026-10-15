/**
 * Every shortcut is defined once, in apps/extension/config/ui/shortcuts.toml. The docs render keys
 * with <Shortcut id="..." />, website messages and README templates with {{SHORTCUT:<id>}} and
 * {{SHORTCUT_MAC:<id>}}, so these tests fail when a document spells keys out by hand, names a
 * shortcut the config lacks, or (for the docs' shortcut list) leaves a configured shortcut out.
 * Store listings are pasted into the stores by hand, so their keys are checked against the config.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
	readShortcutConfig,
	SHORTCUT_LITERAL,
	SHORTCUT_PLACEHOLDER,
	shortcutIds,
	shortcutText,
	site,
} from "@bookmark-scout/config";

const root = resolve(import.meta.dir, "..");
const config = readShortcutConfig(root);
const docsDir = join(root, "apps/docs/content/docs");

function files(dir: string, extension: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return files(path, extension);
		return name.endsWith(extension) ? [path] : [];
	});
}

/** `file:line: text` for each hand-typed shortcut, outside fenced code blocks. */
function literals(file: string): string[] {
	let fenced = false;
	return readFileSync(file, "utf8")
		.split("\n")
		.flatMap((line, index) => {
			if (line.trimStart().startsWith("```")) fenced = !fenced;
			if (fenced) return [];
			return (line.match(SHORTCUT_LITERAL) ?? []).map((found) => `${relative(root, file)}:${index + 1}: ${found}`);
		});
}

const docsPages = files(docsDir, ".mdx");
const websiteMessages = files(join(root, "apps/website/messages"), ".json");
const templates = files(join(root, "templates"), ".md");

describe("shortcuts are never typed by hand", () => {
	test.each([
		["docs pages", docsPages],
		["website messages", websiteMessages],
		["README templates", templates],
	])("%s", (_name, list) => {
		expect(list.flatMap(literals)).toEqual([]);
	});
});

describe("every shortcut named exists in the config", () => {
	test("<Shortcut id> in the docs", () => {
		for (const file of docsPages) {
			for (const [, id] of readFileSync(file, "utf8").matchAll(/<Shortcut\s+id="([^"]+)"/g)) {
				expect(() => shortcutText(config, id ?? ""), relative(root, file)).not.toThrow();
			}
		}
	});

	test("{{SHORTCUT:<id>}} in website messages and README templates", () => {
		for (const file of [...websiteMessages, ...templates]) {
			for (const [, , argument] of readFileSync(file, "utf8").matchAll(SHORTCUT_PLACEHOLDER)) {
				const id = (argument ?? "").split("#")[0] ?? "";
				expect(() => shortcutText(config, id), relative(root, file)).not.toThrow();
			}
		}
	});
});

describe("the keyboard shortcuts guide lists every configured shortcut", () => {
	// Browser keys are named where they matter (install, quick save), not all in the guide.
	const listed = shortcutIds(config).filter((id) => !id.startsWith("browser."));
	const guides = docsPages.filter((file) => /guides\/keyboard-shortcuts(\.[\w-]+)?\.mdx$/.test(file));

	test("in English and every translation", () => {
		expect(guides.length).toBe(site.locales.supported.length);
		for (const file of guides) {
			const text = readFileSync(file, "utf8");
			const missing = listed.filter((id) => !text.includes(`<Shortcut id="${id}" />`));
			expect(missing, relative(root, file)).toEqual([]);
		}
	});
});

describe("store listings name the configured keys", () => {
	// Every way to press every configured shortcut, as text on either platform.
	const known = new Set(
		shortcutIds(config).flatMap((id) => {
			const text = shortcutText(config, id);
			return [...text.other, ...text.mac];
		}),
	);

	test.each(files(join(root, "store/listings"), ".md").map((file) => [relative(root, file), file]))("%s", (_name, file) => {
		const unknown = (readFileSync(file, "utf8").match(SHORTCUT_LITERAL) ?? []).filter((keys) => !known.has(keys));
		expect(unknown).toEqual([]);
	});
});
