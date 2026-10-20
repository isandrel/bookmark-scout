import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { readShortcutConfig, type Site, site } from "@bookmark-scout/config";
import GithubSlugger from "github-slugger";
import {
	createEnvironment,
	ENGINE_CONFIG,
	installedVersion,
	planDocuments,
	readEngineConfig,
	releaseLine,
	renderAll,
	shortcutContext,
	shortcutNotes,
	sourceHash,
	staleTranslations,
	versionContext,
} from "./generate-markdown";

const root = join(import.meta.dir, "..");
const documents = renderAll();
const byOutput = new Map(documents.map((document) => [document.output, document]));

/** A templates folder in a temporary directory, with these files. */
function scratch(files: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), "markdown-templates-"));
	for (const [name, text] of Object.entries(files)) {
		mkdirSync(dirname(join(dir, name)), { recursive: true });
		writeFileSync(join(dir, name), text);
	}
	return dir;
}

const twoLanguages = {
	locales: { ...site.locales, default: "en" },
	markdown: { dir: "i18n", languageOrder: ["en", "ja"], documents: [{ name: "README", languages: ["en", "ja"] }] },
} as unknown as Pick<Site, "locales" | "markdown">;

describe("versions", () => {
	test("releaseLine keeps the major version, or 0.minor before 1.0", () => {
		expect(releaseLine("19.3.0")).toBe("19");
		expect(releaseLine("0.21.4")).toBe("0.21");
		expect(() => releaseLine("latest")).toThrow();
	});

	test("a workspace's versions are the ones its package.json installs", () => {
		const manifest = JSON.parse(readFileSync(join(root, "apps/extension/package.json"), "utf8")) as {
			devDependencies: Record<string, string>;
		};
		const declaredMajor = /\d+/.exec(manifest.devDependencies.typescript ?? "")?.[0] ?? "no typescript";
		const { versions, workspace_versions } = versionContext();
		expect(workspace_versions["apps/extension"]?.typescript).toBe(declaredMajor);
		expect(versions.bun).toBe(releaseLine(installedVersion("bun")));
		expect(() => installedVersion("typescript", root, "apps/nope")).toThrow('Unknown workspace "apps/nope"');
	});
});

describe("shortcuts", () => {
	const config = readShortcutConfig(root);

	test("name each configured shortcut on one platform and on both, in the document's language", () => {
		const english = shortcutContext(config, shortcutNotes("en"));
		const save = english["commands.quick-save"];
		expect(save?.both?.startsWith(save.mac ?? "?")).toBe(true);
		expect(save?.both).toContain(save?.other ?? "?");
		expect(save?.other).toMatch(/^[A-Za-z]+\+/);
		const japanese = shortcutContext(config, shortcutNotes("ja"));
		expect(japanese["commands.quick-save"]?.both).not.toBe(save?.both);
	});

	test("key a shortcut's second way as <id>#2", () => {
		const english = shortcutContext(config, shortcutNotes("en"));
		const second = Object.keys(english).find((key) => key.endsWith("#2"));
		expect(second).toBeDefined();
	});
});

describe("plan", () => {
	test("every configured document and language has a template, and every template is configured", () => {
		const plan = planDocuments();
		for (const { name, languages } of site.markdown.documents) {
			expect(plan.filter((entry) => entry.document === name).map((entry) => entry.language)).toEqual(languages);
		}
	});

	test("fails on a configured language without a template", () => {
		const dir = scratch({ "README.md": "x\n" });
		expect(() => planDocuments(twoLanguages, dir)).toThrow('README in "ja" has no template templates/i18n/ja/README.md');
	});

	test("fails on a template no config entry names", () => {
		const dir = scratch({ "README.md": "x\n", "i18n/ja/README.md": "x\n", "i18n/ja/SECURITY.md": "x\n" });
		expect(() => planDocuments(twoLanguages, dir)).toThrow("templates/i18n/ja/SECURITY.md matches no document");
	});

	test("puts the default language at the root and the others in <dir>/<tag>/", () => {
		expect(byOutput.get("README.md")?.language).toBe(site.locales.default);
		expect(byOutput.get(`${site.markdown.dir}/ja/README.md`)?.language).toBe("ja");
	});
});

describe("engine", () => {
	const env = createEnvironment();

	test("fails on an unknown variable, naming the template and line", () => {
		expect(() => env.renderNamedStr("t.md", "ok\n{{ nope }}", {})).toThrow(/undefined value.*t\.md:2/);
		expect(() => env.renderNamedStr("t.md", '{{ shortcuts["commands.nope"].both }}', documents[0]?.context)).toThrow(
			/undefined/,
		);
	});

	test("does not escape Markdown or HTML", () => {
		expect(env.renderNamedStr("t.md", "{{ '<b>&' }}", {})).toBe("<b>&");
	});

	test("reads only the settings minijinja-cli shares, strictly", () => {
		expect(readEngineConfig().strict).toBe(true);
		const dir = scratch({ [ENGINE_CONFIG]: 'strict = true\ntrim-blocks = true\nlstrip-blocks = true\nautoescape = "none"\nfuel = 1\n' });
		expect(() => readEngineConfig(dir)).toThrow("fuel: unknown key");
		const lenient = scratch({ [ENGINE_CONFIG]: 'strict = false\ntrim-blocks = true\nlstrip-blocks = true\nautoescape = "none"\n' });
		expect(() => readEngineConfig(lenient)).toThrow("strict: must be true");
	});

	test("loads templates from templates/ only", () => {
		expect(() => env.renderNamedStr("t.md", '{% include "../package.json" %}', {})).toThrow();
	});

	test("every variable a template or partial uses exists in the context of every document", () => {
		const names = [...new Set([...documents.map((document) => document.template), "_partials/markdown.md.j2"])];
		const resolves = (context: unknown, path: string) =>
			path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], context) !== undefined;
		for (const name of names) {
			const used = env.undeclaredVariablesInTemplate(name, true);
			for (const document of documents) {
				const missing = used.filter((path) => !resolves(document.context, path));
				expect(missing, `${name} with the context of ${document.output}`).toEqual([]);
			}
		}
	});

	test("the context is plain data, so minijinja-cli renders the dumped context the same way", () => {
		for (const document of documents) {
			const dumped = JSON.parse(JSON.stringify(document.context)) as object;
			expect(`${env.renderTemplate(document.template, dumped)}\n`, document.output).toBe(document.text);
		}
	});
});

describe("language switcher", () => {
	const multilingual = documents.filter((document) => document.languages.length > 1);

	test.each(multilingual.map((document) => [document.output, document]))("%s links every other language", (_name, document) => {
		const block = /^<p align="center">\n([\s\S]*?)\n<\/p>\n/.exec(document.text)?.[1];
		expect(block, "the switcher is the first block").toBeDefined();
		const lines = (block ?? "").split("\n");
		expect(lines).toHaveLength(document.languages.length);
		document.languages.forEach((language, index) => {
			const line = lines[index] ?? "";
			const name = site.locales.name(language);
			if (language === document.language) {
				expect(line).toContain(`<strong lang="${language}">${name}</strong>`);
				return;
			}
			const other = documents.find((candidate) => candidate.document === document.document && candidate.language === language);
			const href = posix.relative(posix.dirname(document.output), other?.output ?? "?");
			expect(line).toContain(`<a href="${href}" lang="${language}" hreflang="${language}">${name}</a>`);
		});
	});

	test("follows the configured language order", () => {
		const readme = documents.filter((document) => document.document === "README").map((document) => document.language);
		expect(readme).toEqual(site.markdown.languageOrder);
	});
});

/** Heading anchors as GitHub makes them, outside fenced code. */
function anchors(text: string): Set<string> {
	const slugger = new GithubSlugger();
	let fenced = false;
	const found = new Set<string>();
	for (const line of text.split("\n")) {
		if (line.trimStart().startsWith("```")) fenced = !fenced;
		const heading = !fenced && /^#{1,6} (.+)$/.exec(line);
		if (heading) found.add(slugger.slug(heading[1] ?? ""));
	}
	return found;
}

/** Relative link targets outside code: Markdown links and href, src, and srcset attributes. */
function relativeLinks(text: string): string[] {
	let fenced = false;
	return text.split("\n").flatMap((line) => {
		if (line.trimStart().startsWith("```")) fenced = !fenced;
		if (fenced) return [];
		const prose = line.replace(/`[^`]*`/g, "");
		return [...prose.matchAll(/\]\(([^)\s]+)\)|(?:href|src|srcset)="([^"]+)"/g)]
			.map((match) => match[1] ?? match[2] ?? "")
			.filter((target) => !/^(https?:|mailto:)/.test(target));
	});
}

describe("links", () => {
	test.each(documents.map((document) => [document.output, document]))("%s: every relative link and anchor resolves", (_name, document) => {
		const broken: string[] = [];
		for (const target of relativeLinks(document.text)) {
			const [path = "", anchor] = target.split("#");
			const file = path === "" ? document.output : posix.normalize(posix.join(posix.dirname(document.output), path));
			const generated = byOutput.get(file);
			if (file.startsWith("../") || (!generated && !existsSync(join(root, file)))) {
				broken.push(`${target}: no file ${file}`);
				continue;
			}
			if (anchor === undefined || !file.endsWith(".md")) continue;
			const text = generated?.text ?? readFileSync(join(root, file), "utf8");
			if (!anchors(text).has(decodeURIComponent(anchor))) broken.push(`${target}: no heading #${anchor} in ${file}`);
		}
		expect(broken).toEqual([]);
	});
});

describe("translation freshness", () => {
	test("every translation names the English template it was made from", () => {
		expect(() => staleTranslations(planDocuments())).not.toThrow();
	});

	test("reports a translation whose English template changed, and fails one without a source line", () => {
		const english = "Hello\n";
		const fresh = scratch({ "README.md": english, "i18n/ja/README.md": `{# source: ${sourceHash(english)} #}\nこんにちは\n` });
		expect(staleTranslations(planDocuments(twoLanguages, fresh), twoLanguages, fresh)).toEqual([]);
		const stale = scratch({ "README.md": "Hello again\n", "i18n/ja/README.md": `{# source: ${sourceHash(english)} #}\nこんにちは\n` });
		expect(staleTranslations(planDocuments(twoLanguages, stale), twoLanguages, stale)).toEqual([
			{ template: "i18n/ja/README.md", source: "README.md", recorded: sourceHash(english), current: sourceHash("Hello again\n") },
		]);
		const unmarked = scratch({ "README.md": english, "i18n/ja/README.md": "こんにちは\n" });
		expect(() => staleTranslations(planDocuments(twoLanguages, unmarked), twoLanguages, unmarked)).toThrow(/start with "\{# source/);
	});
});
