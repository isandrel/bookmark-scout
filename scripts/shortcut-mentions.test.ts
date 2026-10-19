/**
 * Every shortcut is defined once, in apps/extension/config/ui/shortcuts.toml. The docs render keys
 * with <Shortcut id="..." />, website messages and README templates with {{SHORTCUT:<id>}} (both
 * platforms, primary first) or {{SHORTCUT_MAC:<id>}} and {{SHORTCUT_OTHER:<id>}}, so these tests
 * fail when a document spells keys out by hand, names a shortcut the config lacks, or (for the
 * docs' shortcut list) leaves a configured shortcut out. Store listings are pasted into the stores
 * by hand, so their keys are checked against the config, and they and the store checklists must
 * name the primary platform's keys (`[display]` in shortcuts.toml) before the other's.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
	platformOrder,
	readShortcutConfig,
	SHORTCUT_LITERAL,
	SHORTCUT_PLACEHOLDER,
	type ShortcutPlatform,
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
			const text = readFileSync(file, "utf8");
			// A misspelled placeholder would stay in the page as text.
			expect(text.split("{{SHORTCUT").length - 1, relative(root, file)).toBe([...text.matchAll(SHORTCUT_PLACEHOLDER)].length);
			for (const [, , argument] of text.matchAll(SHORTCUT_PLACEHOLDER)) {
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

describe("store listings and checklists name the primary platform's keys first", () => {
	// Keys only one platform uses: `⌥⇧S` is Mac-only, `Alt+Shift+S` is not.
	const [first, second] = platformOrder(config);
	const ways = (platform: ShortcutPlatform) => new Set(shortcutIds(config).flatMap((id) => shortcutText(config, id)[platform]));
	const primary = ways(first);
	const secondary = new Set([...ways(second)].filter((keys) => !primary.has(keys)));
	const onlyPrimary = new Set([...primary].filter((keys) => !ways(second).has(keys)));
	// The Chrome Web Store reviewer notes are a record of the dashboard field as entered.
	const recorded = /^No login needed\. /;

	test.each(
		[...files(join(root, "store/listings"), ".md"), ...files(join(root, "store/checklists"), ".md")].map((file) => [
			relative(root, file),
			file,
		]),
	)("%s", (_name, file) => {
		// A secondary platform's keys need the primary platform's keys earlier on the line, as in
		// "⌥⇧S (Alt+Shift+S on Windows and Linux)".
		const late = readFileSync(file, "utf8")
			.split("\n")
			.flatMap((line, index) => {
				if (recorded.test(line)) return [];
				const found = line.match(SHORTCUT_LITERAL) ?? [];
				const firstPrimary = found.findIndex((keys) => onlyPrimary.has(keys));
				return found
					.filter((keys, position) => secondary.has(keys) && (firstPrimary === -1 || position < firstPrimary))
					.map((keys) => `${index + 1}: ${keys}`);
			});
		expect(late).toEqual([]);
	});
});
