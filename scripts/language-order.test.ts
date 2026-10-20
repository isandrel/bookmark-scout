/**
 * One language order everywhere: the order of `[locales] supported` in config/project.toml (most
 * speakers first). Every list of languages the repository generates derives it from there, so
 * these tests fail when one is built in another order or typed by hand. The built website and
 * docs menus are checked by each site's verify-build script, the extension's Language setting by
 * its locale-messages unit test.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readWorkspaceConfig, site } from "@bookmark-scout/config";
import { planDocuments } from "./generate-markdown";

const root = join(import.meta.dir, "..");
const supported = site.locales.supported;
const names = new Map(supported.map((tag) => [site.locales.name(tag), tag]));

/** Languages a line names by their own names, in the order the line names them. */
function languagesNamed(line: string): string[] {
	return [...names]
		.flatMap(([name, tag]) => {
			const at = line.indexOf(name);
			return at === -1 ? [] : [{ at, tag }];
		})
		.sort((a, b) => a.at - b.at)
		.map(({ tag }) => tag);
}

/** `supported` without the languages a list leaves out, such as a document's missing translations. */
const inOrder = (languages: readonly string[]) => supported.filter((tag) => languages.includes(tag));

test("the extension's languages share the website's order", () => {
	const shared = readWorkspaceConfig().project.locales.extension.filter((tag) => supported.includes(tag));
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
			// Any other line that names several languages, such as the README's "Available in" line.
			for (const line of text.split("\n")) {
				const named = languagesNamed(line);
				if (named.length >= 3) expect(named, line).toEqual(inOrder(named));
			}
		},
	);
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
});
