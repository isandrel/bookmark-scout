/**
 * One language order everywhere: the order of `[locales] supported` in config/project.toml (most
 * speakers first). Every list of languages the repository generates derives it from there, and
 * the docs pages list languages with `<Languages />`, so these tests fail when a list is built in
 * another order or typed by hand in another order. The built website and docs menus are checked
 * by each site's verify-build script, the extension's Language setting by its locale-messages
 * unit test.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { readWorkspaceConfig, site } from "@bookmark-scout/config";
import { getCopy } from "../apps/docs/src/lib/copy";
import { languageList } from "../apps/docs/src/lib/languages";
import { planDocuments } from "./generate-markdown";

const root = join(import.meta.dir, "..");
const supported = site.locales.supported;
const extension = readWorkspaceConfig().project.locales.extension;
/** Every tag, in order: `supported`, then any language only the extension has yet. */
const order = [...supported, ...extension.filter((tag) => !supported.includes(tag))];

/** `order` without the languages a list leaves out, such as a document's missing translations. */
const inOrder = (languages: readonly string[]) => order.filter((tag) => languages.includes(tag));

/**
 * The ways a page names the languages: each one's own name (`[locales.names]`), and each
 * language's names in every docs language (`languages` in the docs copy).
 */
const namings: Map<string, string>[] = [
	new Map(supported.map((tag) => [site.locales.name(tag).toLowerCase(), tag])),
	...supported.map(
		(locale) =>
			new Map(Object.entries(getCopy(locale).languages).map(([tag, name]) => [name.toLocaleLowerCase(locale), tag])),
	),
];

/** For each way of naming them, the languages a line names, in the order the line names them. */
function languagesNamed(line: string): string[][] {
	const lower = line.toLowerCase();
	return namings.map((names) =>
		[...names]
			.flatMap(([name, tag]) => {
				const at = lower.indexOf(name);
				return at === -1 ? [] : [{ at, tag }];
			})
			.sort((a, b) => a.at - b.at)
			.map(({ tag }) => tag),
	);
}

/** Fails on a line that names every supported language in another order than the config's. */
function expectFullListsInOrder(file: string, text: string) {
	for (const line of text.split("\n")) {
		for (const named of languagesNamed(line)) {
			if (supported.every((tag) => named.includes(tag))) {
				expect(named, `${file}: ${line}`).toEqual(inOrder(named));
			}
		}
	}
}

/** Files under `dir` (relative to the root) whose names end with one of `extensions`. */
function files(dir: string, extensions: readonly string[]): string[] {
	return readdirSync(join(root, dir)).flatMap((name) => {
		const path = `${dir}/${name}`;
		if (statSync(join(root, path)).isDirectory()) return files(path, extensions);
		return extensions.some((extension) => name.endsWith(extension)) ? [path] : [];
	});
}

test("the extension's languages share the website's order", () => {
	const shared = extension.filter((tag) => supported.includes(tag));
	expect(shared).toEqual(inOrder(shared));
});

describe("generated Markdown", () => {
	const documents = planDocuments();

	test.each(documents.map((document) => [document.output, document] as const))(
		"%s lists languages in the configured order",
		(output, document) => {
			const text = readFileSync(join(root, output), "utf8");
			const switcher = /^<p align="center">\n([\s\S]*?)\n<\/p>\n/.exec(text)?.[1];
			if (document.languages.length > 1) {
				const linked = [...(switcher ?? "").matchAll(/ lang="([^"]+)"/g)].map((match) => match[1] ?? "");
				expect(linked).toEqual(inOrder(document.languages));
			}
			// Any other full list, such as the README's "Available in" line.
			expectFullListsInOrder(output, text);
		},
	);
});

describe("hand-written pages", () => {
	const pages = [
		...files("templates", [".md"]),
		...files("apps/docs/content/docs", [".mdx"]),
		...files("store", [".md"]),
	];

	test.each(pages.map((path) => [relative(root, join(root, path))]))("%s lists languages in the configured order", (path) => {
		expectFullListsInOrder(path, readFileSync(join(root, path), "utf8"));
	});
});

describe("website and docs", () => {
	test("hreflang alternates, in page metadata and the sitemaps, follow the configured order", () => {
		const alternates = Object.keys(site.url.alternates("/privacy")).filter((tag) => tag !== "x-default");
		expect(alternates).toEqual(supported);
	});

	test("the website routes its languages in the configured order", async () => {
		const { routing } = await import("../apps/website/i18n/routing");
		expect(routing.locales).toEqual(supported);
	});

	test("the docs language menu lists the languages in the configured order", async () => {
		const { i18n, i18nProviderProps } = await import("../apps/docs/src/lib/i18n");
		expect(i18n.languages).toEqual(supported);
		for (const locale of supported) {
			expect(i18nProviderProps(locale).locales.map((entry) => entry.locale)).toEqual(supported);
		}
	});

	test.each(supported.map((locale) => [locale]))("the docs copy in %s names every language", (locale) => {
		const names = getCopy(locale).languages;
		expect(Object.keys(names).sort()).toEqual([...order].sort());
	});

	test.each(supported.map((locale) => [locale]))("<Languages /> in %s lists them in the configured order", (locale) => {
		const names = getCopy(locale).languages;
		for (const of of ["supported", "extension"] as const) {
			const text = languageList(locale, { of, join: "or" });
			const tags = of === "extension" ? extension : supported;
			const positions = tags.map((tag) => text.indexOf(names[tag] ?? tag));
			expect(positions.every((at) => at >= 0)).toBe(true);
			expect(positions).toEqual([...positions].sort((a, b) => a - b));
		}
	});
});
