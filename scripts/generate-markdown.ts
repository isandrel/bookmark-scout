#!/usr/bin/env bun
/// <reference types="bun" />
/**
 * Generates the root Markdown documents and their translations from templates/: README.md,
 * CONTRIBUTING.md, and DEVELOPMENT.md, and i18n/<tag>/<document>.md for every other language,
 * as `[markdown]` in config/project.toml lists them.
 *
 * Templates are MiniJinja (the minijinja-js package, the same engine as minijinja-cli). Each
 * template's path under templates/ is its output's path. The context is plain data, built here
 * from the workspace config (`@bookmark-scout/config`), the website's routes and messages, the
 * extension's shortcuts, and the installed package versions, so no template types a value by
 * hand. Shared blocks (the language switcher, badges, store lines) are macros in
 * templates/_partials/. Engine settings are in templates/minijinja.toml, which minijinja-cli
 * reads too, so `--dump-context` plus the CLI renders a template the same way.
 *
 *   bun run generate:markdown                       write every output
 *   bun run generate:markdown --check               write nothing; fail if an output is missing or stale
 *   bun run generate:markdown --stale               list translations made from an older English template
 *   bun run generate:markdown --list                print every output path
 *   bun run generate:markdown --dump-context <document> <language>   print a template's context as JSON
 *
 * An undefined variable, a configured document or language without a template, a template no
 * config entry names, or a translation without its `{# source: <hash> #}` line fails the run.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, posix, resolve, sep } from "node:path";
import {
	parseShortcutNotes,
	readShortcutConfig,
	SCREENSHOTS,
	type ShortcutConfig,
	type ShortcutNotes,
	shortcutIds,
	shortcutPlaceholderPair,
	shortcutText,
	withClickWord,
	type Site,
	site,
} from "@bookmark-scout/config";
import { Environment } from "minijinja-js";
import { INDEXABLE_ROUTES } from "../apps/website/lib/content/routes";

const rootDir = resolve(import.meta.dir, "..");
export const TEMPLATES_DIR = "templates";
/** Engine settings in minijinja-cli's config format, shared with the CLI. */
export const ENGINE_CONFIG = "minijinja.toml";

/** Workspace folders whose `node_modules` may hold a package, root first. */
const PACKAGE_DIRS = [".", "apps/extension", "apps/website", "apps/docs", "packages/config"];

/** shields.io colors and logos for the browser badges. README presentation only. */
const BROWSER_BADGE_STYLES: Record<string, { color: string; logo: string }> = {
	chrome: { color: "4285F4", logo: "googlechrome" },
	firefox: { color: "FF7139", logo: "firefox" },
	edge: { color: "0078D7", logo: "microsoftedge" },
};

/** The first line of a translated template: the English template's hash when it was translated. */
const SOURCE_LINE = /^\{# source: ([0-9a-f]{12}) #\}\n/;

// ---------------------------------------------------------------------------------------------
// Versions

/**
 * The version shown for a library: the major version, or `0.minor` before 1.0. Minor and
 * patch updates then leave the documents unchanged, so dependency PRs do not need a regenerate.
 */
export function releaseLine(version: string): string {
	const match = /^(\d+)\.(\d+)/.exec(version);
	if (!match) throw new Error(`Cannot read a version from "${version}"`);
	const [, major, minor] = match;
	return major === "0" ? `0.${minor}` : (major as string);
}

function readJson<T>(file: string): T {
	return JSON.parse(readFileSync(file, "utf8")) as T;
}

/**
 * Installed version of a package, or of Bun from the root `packageManager`. Without a workspace,
 * the first workspace in `PACKAGE_DIRS` that has it wins; with one, only that workspace counts.
 */
export function installedVersion(name: string, root = rootDir, workspace?: string): string {
	if (name === "bun") {
		const version = /^bun@(.+)$/.exec(readJson<{ packageManager?: string }>(join(root, "package.json")).packageManager ?? "")?.[1];
		if (!version) throw new Error('package.json: set "packageManager": "bun@<version>"');
		return version;
	}
	if (workspace !== undefined && !PACKAGE_DIRS.includes(workspace)) {
		throw new Error(`Unknown workspace "${workspace}"; expected one of ${PACKAGE_DIRS.join(", ")}`);
	}
	for (const dir of workspace === undefined ? PACKAGE_DIRS : [workspace]) {
		const file = join(root, dir, "node_modules", name, "package.json");
		if (existsSync(file)) return readJson<{ version: string }>(file).version;
	}
	const where = workspace === undefined ? "" : ` in ${workspace}`;
	throw new Error(`Package "${name}" is not installed${where}; run bun install`);
}

/** The packages a workspace's package.json declares. */
function declaredPackages(root: string, workspace: string): string[] {
	const manifest = readJson<{ dependencies?: object; devDependencies?: object }>(join(root, workspace, "package.json"));
	return Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).sort();
}

/**
 * Release lines of every declared package: `versions` as the first workspace that installs it
 * (plus `bun`), and `workspace_versions` per workspace, for packages whose major differs by
 * workspace (TypeScript).
 */
export function versionContext(root = rootDir) {
	const workspaceVersions = Object.fromEntries(
		PACKAGE_DIRS.map((workspace) => [
			workspace,
			Object.fromEntries(
				declaredPackages(root, workspace).map((name) => [name, releaseLine(installedVersion(name, root, workspace))]),
			),
		]),
	);
	const names = [...new Set(PACKAGE_DIRS.flatMap((workspace) => declaredPackages(root, workspace)))].sort();
	const versions = Object.fromEntries([
		...names.map((name) => [name, releaseLine(installedVersion(name, root))]),
		["bun", releaseLine(installedVersion("bun", root))],
	]);
	return { versions, workspace_versions: workspaceVersions };
}

// ---------------------------------------------------------------------------------------------
// Shortcuts

/**
 * How `locale` names each platform's keys, from `shortcutNotes` in the website messages, so the
 * documents word them as the website does.
 */
export function shortcutNotes(locale: string, root = rootDir): ShortcutNotes {
	const file = join(root, "apps/website/messages", `${locale}.json`);
	return parseShortcutNotes(readJson<{ shortcutNotes?: unknown }>(file).shortcutNotes, file);
}

type ShortcutEntry = { both?: string; mac?: string; other?: string };

/**
 * Every configured shortcut as text, keyed `<id>` for its first way and `<id>#<n>` for the n-th:
 * `mac` and `other` for one platform, `both` for both platforms labelled in `notes`' language,
 * the primary platform first: "⌥⇧S on Mac (Alt+Shift+S on Windows and Linux)".
 */
export function shortcutContext(config: ShortcutConfig, notes: ShortcutNotes): Record<string, ShortcutEntry> {
	return Object.fromEntries(
		shortcutIds(config).flatMap((id) => {
			const text = shortcutText(config, id);
			const ways = Math.max(text.mac.length, text.other.length);
			return Array.from({ length: ways }, (_unused, index) => {
				const key = index === 0 ? id : `${id}#${index + 1}`;
				const mac = text.mac[index];
				const other = text.other[index];
				const entry: ShortcutEntry = {};
				if (mac !== undefined && other !== undefined) entry.both = shortcutPlaceholderPair(config, key, notes);
				if (mac !== undefined) entry.mac = withClickWord(mac, notes);
				if (other !== undefined) entry.other = withClickWord(other, notes);
				return [key, entry] as const;
			});
		}),
	);
}

// ---------------------------------------------------------------------------------------------
// Documents

export type DocumentPlan = {
	document: string;
	language: string;
	/** Output path relative to the root, with `/`. */
	output: string;
	/** Template name, its path relative to templates/. Equals `output`. */
	template: string;
	/** Every language this document has, in switcher order. */
	languages: readonly string[];
};

/** Where a document goes in a language: the root for the default language, else `<dir>/<tag>/`. */
export function outputPath(document: string, language: string, model: Pick<Site, "locales" | "markdown"> = site): string {
	return language === model.locales.default ? `${document}.md` : `${model.markdown.dir}/${language}/${document}.md`;
}

/** Every Markdown template under `dir`, relative to it with `/`. Partials (`.j2`) are not documents. */
function templateFiles(dir: string, prefix = ""): string[] {
	return readdirSync(join(dir, prefix)).flatMap((name) => {
		const path = prefix ? `${prefix}/${name}` : name;
		if (statSync(join(dir, path)).isDirectory()) return templateFiles(dir, path);
		return name.endsWith(".md") ? [path] : [];
	});
}

/**
 * Every (document, language) the config lists, with its template and output. Fails when one has
 * no template, or a template matches no configured document and language.
 */
export function planDocuments(
	model: Pick<Site, "locales" | "markdown"> = site,
	templatesDir = join(rootDir, TEMPLATES_DIR),
): DocumentPlan[] {
	const plan = model.markdown.documents.flatMap(({ name, languages }) =>
		languages.map((language) => {
			const output = outputPath(name, language, model);
			return { document: name, language, output, template: output, languages };
		}),
	);
	const problems: string[] = [];
	for (const entry of plan) {
		if (!existsSync(join(templatesDir, entry.template))) {
			problems.push(`${entry.document} in "${entry.language}" has no template ${TEMPLATES_DIR}/${entry.template}`);
		}
	}
	const expected = new Set(plan.map((entry) => entry.template));
	for (const file of templateFiles(templatesDir)) {
		if (!expected.has(file)) {
			problems.push(`${TEMPLATES_DIR}/${file} matches no document and language in [markdown] of config/project.toml`);
		}
	}
	if (problems.length > 0) throw new Error(`Markdown templates do not match the config:\n  - ${problems.join("\n  - ")}`);
	return plan;
}

/** A relative link from one output to another root path, with `/`. */
function relativeLink(from: string, to: string): string {
	return posix.relative(posix.dirname(from), to) || posix.basename(to);
}

/** What an output puts before a root path to link it: `""` at the root, `../../` in i18n/<tag>/. */
function rootPrefix(output: string): string {
	const up = posix.relative(posix.dirname(output), ".");
	return up === "" ? "" : `${up}/`;
}

// ---------------------------------------------------------------------------------------------
// Context

/** Values every document shares, whatever its language. */
export function sharedContext(model: Site = site, root = rootDir) {
	const repoName = model.repo.slug.split("/").at(-1) ?? model.repo.slug;
	return {
		site: {
			name: model.name,
			description: model.description,
			url: model.url.origin,
			docs_url: model.docs.origin,
			author: { name: model.author.name, url: model.author.url },
			repo: {
				url: model.repo.base,
				slug: model.repo.slug,
				name: repoName,
				branch: model.repo.defaultBranch,
				new_issue: model.repo.newIssue,
			},
			license: { spdx: model.license.spdx, file_url: model.license.fileUrl },
			brand_color: model.theme.accent.replace(/^#/, ""),
		},
		locales: model.locales.supported.map((tag) => ({ tag, name: model.locales.name(tag) })),
		browsers: model.browsers.supported.map((id) => ({ id, name: model.browsers.name(id), badge: badgeStyle(id) })),
		stores: model.stores.map((store) => ({
			browser: store.browser,
			browser_name: model.browsers.name(store.browser),
			name: store.name,
			url: store.url,
			live: store.live,
			badge: badgeStyle(store.browser),
		})),
		contact: Object.fromEntries(model.contact.roles.map((role) => [role, model.contact.address(role)])),
		screenshots: Object.fromEntries(
			Object.entries(SCREENSHOTS).map(([name, pair]) => [
				name,
				Object.fromEntries(Object.entries(pair).map(([theme, file]) => [theme, model.repo.raw(`apps/website/public${file}`)])),
			]),
		),
		...versionContext(root),
	};
}

function badgeStyle(browser: string): { color: string; logo: string } {
	const style = BROWSER_BADGE_STYLES[browser];
	if (!style) throw new Error(`No badge style for browser "${browser}"; add it to BROWSER_BADGE_STYLES`);
	return style;
}

export type SharedContext = ReturnType<typeof sharedContext>;

/** Values that depend on the document and its language. */
export function documentContext(
	entry: DocumentPlan,
	plan: readonly DocumentPlan[],
	shared: SharedContext,
	shortcuts: ShortcutConfig,
	model: Site = site,
	root = rootDir,
) {
	const { output, language } = entry;
	const routeName = (route: string) => route.replace(/^\//, "") || "home";
	const links = Object.fromEntries(
		model.markdown.documents.map(({ name, languages }) => {
			const target = outputPath(name, languages.includes(language) ? language : model.locales.default, model);
			return [name, relativeLink(output, target)];
		}),
	);
	return {
		...shared,
		document: { name: entry.document, language, path: output },
		root: rootPrefix(output),
		links,
		languages: entry.languages.map((tag) => {
			const other = plan.find((candidate) => candidate.document === entry.document && candidate.language === tag);
			if (!other) throw new Error(`${entry.document} has no plan entry for "${tag}"`);
			return { tag, name: model.locales.name(tag), href: relativeLink(output, other.output), current: tag === language };
		}),
		docs_url: model.docs.page(language),
		pages: Object.fromEntries(INDEXABLE_ROUTES.map((route) => [routeName(route), model.url.page(language, route)])),
		shortcuts: shortcutContext(shortcuts, shortcutNotes(language, root)),
	};
}

export type DocumentContext = ReturnType<typeof documentContext>;

// ---------------------------------------------------------------------------------------------
// Engine

type EngineConfig = { strict: boolean; "trim-blocks": boolean; "lstrip-blocks": boolean; autoescape: "none" };

/** Reads templates/minijinja.toml strictly: only the settings both engines share. */
export function readEngineConfig(templatesDir = join(rootDir, TEMPLATES_DIR)): EngineConfig {
	const file = `${TEMPLATES_DIR}/${ENGINE_CONFIG}`;
	const raw = Bun.TOML.parse(readFileSync(join(templatesDir, ENGINE_CONFIG), "utf8")) as Record<string, unknown>;
	const problems: string[] = [];
	const keys = ["strict", "trim-blocks", "lstrip-blocks", "autoescape"];
	for (const key of Object.keys(raw)) if (!keys.includes(key)) problems.push(`${key}: unknown key`);
	for (const key of ["strict", "trim-blocks", "lstrip-blocks"]) {
		if (typeof raw[key] !== "boolean") problems.push(`${key}: expected true or false`);
	}
	if (raw.strict !== true) problems.push("strict: must be true, so an unknown variable fails the run");
	if (raw.autoescape !== "none") problems.push('autoescape: must be "none" for Markdown');
	if (problems.length > 0) throw new Error(`${file} is invalid:\n  - ${problems.join("\n  - ")}`);
	return raw as EngineConfig;
}

/**
 * A MiniJinja environment that loads templates from `templatesDir` only, resolves includes and
 * imports relative to the template that names them (as minijinja-cli does), and applies the
 * shared engine settings.
 */
export function createEnvironment(templatesDir = join(rootDir, TEMPLATES_DIR)): Environment {
	const config = readEngineConfig(templatesDir);
	const env = new Environment();
	env.undefinedBehavior = "strict";
	env.trimBlocks = config["trim-blocks"];
	env.lstripBlocks = config["lstrip-blocks"];
	// minijinja-cli drops the template's final newline and prints one; render() does the same.
	env.keepTrailingNewline = false;
	env.setAutoEscapeCallback(() => config.autoescape);
	env.setPathJoinCallback((name, parent) => posix.normalize(posix.join(posix.dirname(parent), name)));
	const base = resolve(templatesDir);
	env.setLoader((name) => {
		const file = resolve(base, name);
		if (!file.startsWith(base + sep)) throw new Error(`Template "${name}" is outside ${TEMPLATES_DIR}/`);
		return existsSync(file) ? readFileSync(file, "utf8") : null;
	});
	return env;
}

/** Renders one template with its context, ending in one newline like minijinja-cli. */
export function render(env: Environment, template: string, context: object): string {
	return `${env.renderTemplate(template, context)}\n`;
}

// ---------------------------------------------------------------------------------------------
// Translation freshness

/** The first 12 hex digits of a template's SHA-256, which translations record as their source. */
export function sourceHash(text: string): string {
	return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

export type StaleTranslation = { template: string; source: string; recorded: string; current: string };

/**
 * Translations whose English template changed after they were made. A translation without a
 * `{# source: <hash> #}` first line fails.
 */
export function staleTranslations(
	plan: readonly DocumentPlan[],
	model: Pick<Site, "locales"> = site,
	templatesDir = join(rootDir, TEMPLATES_DIR),
): StaleTranslation[] {
	return plan.flatMap((entry) => {
		if (entry.language === model.locales.default) return [];
		const source = plan.find((other) => other.document === entry.document && other.language === model.locales.default);
		if (!source) throw new Error(`${entry.document} has no ${model.locales.default} template`);
		const current = sourceHash(readFileSync(join(templatesDir, source.template), "utf8"));
		const recorded = SOURCE_LINE.exec(readFileSync(join(templatesDir, entry.template), "utf8"))?.[1];
		if (!recorded) {
			throw new Error(
				`${TEMPLATES_DIR}/${entry.template}: start with "{# source: <hash> #}", the hash of the ${TEMPLATES_DIR}/${source.template} it translates; translated from today's, that is {# source: ${current} #}`,
			);
		}
		return recorded === current ? [] : [{ template: entry.template, source: source.template, recorded, current }];
	});
}

// ---------------------------------------------------------------------------------------------
// Rendering everything

export type RenderedDocument = DocumentPlan & { text: string; context: DocumentContext };

/** Renders every configured document in every language, in memory. */
export function renderAll(root = rootDir, model: Site = site, templatesDir = join(root, TEMPLATES_DIR)): RenderedDocument[] {
	const plan = planDocuments(model, templatesDir);
	const env = createEnvironment(templatesDir);
	const shared = sharedContext(model, root);
	const shortcuts = readShortcutConfig(root);
	return plan.map((entry) => {
		const context = documentContext(entry, plan, shared, shortcuts, model, root);
		return { ...entry, context, text: render(env, entry.template, context) };
	});
}

function main(args: string[]): number {
	const dump = args.indexOf("--dump-context");
	if (dump !== -1) {
		const [document, language] = args.slice(dump + 1);
		const plan = planDocuments();
		const entry = plan.find((candidate) => candidate.document === document && candidate.language === language);
		if (!entry) {
			console.error(`No ${document ?? "<document>"} in "${language ?? "<language>"}". Usage: --dump-context <document> <language>`);
			return 1;
		}
		const context = documentContext(entry, plan, sharedContext(), readShortcutConfig(rootDir));
		console.log(JSON.stringify(context, null, 2));
		return 0;
	}
	if (args.includes("--list")) {
		for (const entry of planDocuments()) console.log(entry.output);
		return 0;
	}

	const plan = planDocuments();
	const stale = staleTranslations(plan);
	if (args.includes("--stale")) {
		for (const entry of stale) {
			console.log(`${TEMPLATES_DIR}/${entry.template}: ${TEMPLATES_DIR}/${entry.source} changed since ${entry.recorded}; once updated, set {# source: ${entry.current} #}`);
		}
		if (stale.length === 0) console.log("Every translation matches its English template.");
		return stale.length === 0 ? 0 : 1;
	}

	const check = args.includes("--check");
	const outdated: string[] = [];
	for (const document of renderAll()) {
		const target = join(rootDir, document.output);
		if (check) {
			if (!existsSync(target) || readFileSync(target, "utf8") !== document.text) outdated.push(document.output);
			continue;
		}
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, document.text, "utf8");
		console.log(`${TEMPLATES_DIR}/${document.template} -> ${document.output}`);
	}
	// Translations may lag the English text, so a stale one is reported, not a failure.
	for (const entry of stale) {
		const message = `${TEMPLATES_DIR}/${entry.template} was translated from an older ${TEMPLATES_DIR}/${entry.source}; run 'bun run generate:markdown --stale'`;
		console.warn(process.env.GITHUB_ACTIONS === "true" ? `::warning file=${TEMPLATES_DIR}/${entry.template}::${message}` : `Warning: ${message}`);
	}
	if (outdated.length > 0) {
		console.error(`Out of date: ${outdated.join(", ")}. Run 'bun run generate:markdown' and commit the result.`);
		return 1;
	}
	return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
