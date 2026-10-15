#!/usr/bin/env bun
/// <reference types="bun" />
/**
 * Generates README.md, translations/README.<locale>.md, and the other root Markdown files
 * (DEVELOPMENT.md) from templates/.
 *
 * Values come from the workspace config through `@bookmark-scout/config`, and library
 * versions from the installed packages, so the generated files never hold a hand-typed copy.
 *
 *   bun run generate:readme           write every output
 *   bun run generate:readme --check   write nothing; fail if an output is missing or stale
 *
 * Placeholders:
 *   {{NAME}}                 a value from `readmeValues()`
 *   {{VERSION:<package>}}    the installed package's release line ("bun" reads packageManager)
 *   {{VERSION:<workspace>:<package>}} the same, as installed for that workspace's package.json;
 *                            use it when workspaces pin different majors (TypeScript)
 *   {{BROWSER_BADGES:<label>}} one shields.io badge per supported browser, labelled <label>
 *   {{STORE_BADGES:<label>}} one large linked button per live store listing, reading <label>;
 *                            empty while no listing is live
 *   {{STORE_LINKS:<pending>}} one Markdown list item per supported browser: its store listing
 *                            when live, otherwise the <pending> text
 *   {{SITE_PAGE:<locale>:<route>}} a website page, such as {{SITE_PAGE:en:/privacy}}
 *   {{CONTACT:<role>}}       a contact address from config/project.toml, such as support
 *   {{SCREENSHOT:<name>:<theme>}} raw GitHub URL of a product screenshot (light or dark)
 *   {{SHORTCUT:<id>}}        a shortcut's keys from apps/extension/config/ui/shortcuts.toml, such as
 *                            {{SHORTCUT:commands.quick-save}} (Alt+Shift+S); <id>#2 is its second way
 *   {{SHORTCUT_MAC:<id>}}    the same keys on a Mac (⌥⇧S)
 *
 * STORE_BADGES and STORE_LINKS text may use per-browser tokens: @BROWSER (browser name),
 * @STORE (store name), @ID (browser id, also its tab anchor on the docs install page), and
 * @DOCS (docs origin).
 *
 * A placeholder that cannot be filled fails the run.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
	type ContactRole,
	readShortcutConfig,
	SCREENSHOTS,
	type ShortcutPlatform,
	type Site,
	type StoreListing,
	shortcutPlaceholderText,
	site,
} from "@bookmark-scout/config";

const rootDir = resolve(import.meta.dir, "..");
const templatesDir = join(rootDir, "templates");
const translationsDir = join(rootDir, "translations");

/** Workspace folders whose `node_modules` may hold a package, root first. */
const PACKAGE_DIRS = [".", "apps/extension", "apps/website", "apps/docs", "packages/config"];

/** shields.io colors and logos for the browser badges. README presentation only. */
const BROWSER_BADGE_STYLES: Record<string, { color: string; logo: string }> = {
	chrome: { color: "4285F4", logo: "googlechrome" },
	firefox: { color: "FF7139", logo: "firefox" },
	edge: { color: "0078D7", logo: "microsoftedge" },
};

const PLACEHOLDER = /\{\{([A-Z_]+)(?::([^}]+))?\}\}/g;

/** Escapes text for a shields.io static badge path segment. */
export function badgeText(text: string): string {
	return text.replaceAll("-", "--").replaceAll("_", "__").replaceAll(" ", "%20");
}

/**
 * The version shown for a library: the major version, or `0.minor` before 1.0. Minor and
 * patch updates then leave the READMEs unchanged, so dependency PRs do not need a regenerate.
 */
export function releaseLine(version: string): string {
	const match = /^(\d+)\.(\d+)/.exec(version);
	if (!match) throw new Error(`Cannot read a version from "${version}"`);
	const [, major, minor] = match;
	return major === "0" ? `0.${minor}` : (major as string);
}

/** Splits a `{{VERSION:...}}` argument into the package and the optional workspace before it. */
export function parseVersionArgument(argument: string): { name: string; workspace?: string } {
	const separator = argument.lastIndexOf(":");
	if (separator === -1) return { name: argument };
	return { workspace: argument.slice(0, separator), name: argument.slice(separator + 1) };
}

/**
 * Installed version of a package, or of Bun from the root `packageManager`. Without a workspace,
 * the first workspace in `PACKAGE_DIRS` that has it wins; with one, only that workspace counts.
 */
export function installedVersion(name: string, root = rootDir, workspace?: string): string {
	if (name === "bun") {
		const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { packageManager?: string };
		const version = /^bun@(.+)$/.exec(manifest.packageManager ?? "")?.[1];
		if (!version) throw new Error('package.json: set "packageManager": "bun@<version>"');
		return version;
	}
	if (workspace !== undefined && !PACKAGE_DIRS.includes(workspace)) {
		throw new Error(`Unknown workspace "${workspace}"; expected one of ${PACKAGE_DIRS.join(", ")}`);
	}
	for (const dir of workspace === undefined ? PACKAGE_DIRS : [workspace]) {
		const file = join(root, dir, "node_modules", name, "package.json");
		if (existsSync(file)) return (JSON.parse(readFileSync(file, "utf8")) as { version: string }).version;
	}
	const where = workspace === undefined ? "" : ` in ${workspace}`;
	throw new Error(`Package "${name}" is not installed${where}; run bun install`);
}

export function readmeValues(model: Site = site): Record<string, string> {
	return {
		SITE_NAME: model.name,
		SITE_DESCRIPTION: model.description,
		SITE_URL: model.url.origin,
		DOCS_URL: model.docs.origin,
		AUTHOR_NAME: model.author.name,
		AUTHOR_URL: model.author.url,
		GITHUB_URL: model.repo.base,
		GITHUB_REPO: model.repo.slug,
		DEFAULT_BRANCH: model.repo.defaultBranch,
		LICENSE_SPDX: model.license.spdx,
		LICENSE_BADGE: badgeText(model.license.spdx),
		LICENSE_FILE_URL: model.license.fileUrl,
		BRAND_COLOR: model.theme.accent.replace(/^#/, ""),
		LANGUAGE_NAMES: model.locales.supported.map((locale) => model.locales.name(locale)).join(" · "),
		NEW_ISSUE_URL: model.repo.newIssue,
	};
}

/** Fills the per-browser tokens of STORE_BADGES and STORE_LINKS text. */
export function fillStoreTokens(text: string, store: StoreListing, model: Site = site): string {
	return text
		.replaceAll("@BROWSER", model.browsers.name(store.browser))
		.replaceAll("@STORE", store.name)
		.replaceAll("@ID", store.browser)
		.replaceAll("@DOCS", model.docs.origin);
}

/** `{{SITE_PAGE:<locale>:<route>}}`: the website page, validated by the site model. */
export function sitePage(argument: string, model: Site = site): string {
	const separator = argument.indexOf(":");
	if (separator === -1) throw new Error(`SITE_PAGE needs <locale>:<route>, got "${argument}"`);
	return model.url.page(argument.slice(0, separator), argument.slice(separator + 1));
}

/** `{{CONTACT:<role>}}`: a contact address; an unknown role fails. */
export function contactAddress(role: string, model: Site = site): string {
	const known = model.contact.roles.find((entry) => entry === role);
	if (!known) throw new Error(`Unknown contact role "${role}"; expected one of ${model.contact.roles.join(", ")}`);
	return model.contact.address(known);
}

/** `{{SCREENSHOT:<name>:<theme>}}`: the screenshot as GitHub serves it from the website's copy. */
export function screenshotUrl(argument: string, model: Site = site): string {
	const [name = "", theme = ""] = argument.split(":");
	const file = (SCREENSHOTS as Record<string, Record<string, string> | undefined>)[name]?.[theme];
	if (!file) {
		throw new Error(`Unknown screenshot "${argument}"; expected <${Object.keys(SCREENSHOTS).join("|")}>:<light|dark>`);
	}
	return model.repo.raw(`apps/website/public${file}`);
}

export function browserBadges(label: string, model: Site = site): string {
	return model.browsers.supported
		.map((browser) => {
			const style = BROWSER_BADGE_STYLES[browser];
			if (!style) throw new Error(`No README badge style for browser "${browser}"; add it to BROWSER_BADGE_STYLES`);
			const name = model.browsers.name(browser);
			return `  <img src="https://img.shields.io/badge/${badgeText(name)}-${badgeText(label)}-${style.color}?style=flat-square&logo=${style.logo}&logoColor=white" alt="${name}">`;
		})
		.join("\n");
}

export function storeBadges(label: string, model: Site = site): string {
	return model.stores
		.filter((store) => store.live)
		.map((store) => {
			const style = BROWSER_BADGE_STYLES[store.browser];
			if (!style) throw new Error(`No README badge style for browser "${store.browser}"; add it to BROWSER_BADGE_STYLES`);
			const text = fillStoreTokens(label, store, model);
			return `  <a href="${store.url}"><img src="https://img.shields.io/badge/${badgeText(text)}-${style.color}?style=for-the-badge&logo=${style.logo}&logoColor=white" alt="${text} (${store.name})" height="40"></a>`;
		})
		.join("\n");
}

/** Where each supported browser installs from: its live store listing, or the `pending` text. */
export function storeLinks(pending: string, model: Site = site): string {
	return model.browsers.supported
		.map((browser) => {
			const store = model.store(browser);
			const target = store.live ? `[${store.name}](${store.url})` : fillStoreTokens(pending, store, model);
			return `- **${model.browsers.name(browser)}**: ${target}`;
		})
		.join("\n");
}

type RenderContext = {
	values: Record<string, string>;
	version: (name: string, workspace?: string) => string;
	browserBadges: (label: string) => string;
	storeBadges: (label: string) => string;
	storeLinks: (label: string) => string;
	sitePage: (argument: string) => string;
	contact: (role: string) => string;
	screenshot: (argument: string) => string;
	shortcut: (argument: string, platform: ShortcutPlatform) => string;
};

/** Fills every placeholder in `template`; throws listing any it cannot fill. */
export function render(template: string, context: RenderContext, label = "template"): string {
	const unknown = new Set<string>();
	const output = template.replace(PLACEHOLDER, (match, name: string, argument?: string) => {
		if (name === "VERSION" && argument) {
			const { name: packageName, workspace } = parseVersionArgument(argument);
			return releaseLine(context.version(packageName, workspace));
		}
		if (name === "BROWSER_BADGES" && argument) return context.browserBadges(argument);
		if (name === "STORE_BADGES" && argument) return context.storeBadges(argument);
		if (name === "STORE_LINKS" && argument) return context.storeLinks(argument);
		if (name === "SITE_PAGE" && argument) return context.sitePage(argument);
		if (name === "CONTACT" && argument) return context.contact(argument);
		if (name === "SCREENSHOT" && argument) return context.screenshot(argument);
		if (name === "SHORTCUT" && argument) return context.shortcut(argument, "other");
		if (name === "SHORTCUT_MAC" && argument) return context.shortcut(argument, "mac");
		const value = argument === undefined ? context.values[name] : undefined;
		if (value === undefined) {
			unknown.add(match);
			return match;
		}
		return value;
	});
	if (unknown.size > 0) throw new Error(`${label}: unknown placeholders ${[...unknown].join(", ")}`);
	return output;
}

/** `README.md` goes to the root; `README.<locale>.md` to translations/; anything else to the root. */
export function outputPathFor(file: string): string {
	if (file !== "README.md" && file.startsWith("README.")) return join(translationsDir, file);
	return join(rootDir, file);
}

/** Fills placeholders from the repository config and the installed packages. */
export function repositoryContext(root = rootDir): RenderContext {
	const shortcuts = readShortcutConfig(root);
	return {
		values: readmeValues(),
		version: (name, workspace) => installedVersion(name, root, workspace),
		browserBadges: (label) => browserBadges(label),
		storeBadges: (label) => storeBadges(label),
		storeLinks: (label) => storeLinks(label),
		sitePage: (argument) => sitePage(argument),
		contact: (role) => contactAddress(role),
		screenshot: (argument) => screenshotUrl(argument),
		shortcut: (argument, platform) => shortcutPlaceholderText(shortcuts, argument, platform),
	};
}

if (import.meta.main) {
	const check = process.argv.includes("--check");
	const context = repositoryContext();
	const stale: string[] = [];
	for (const file of readdirSync(templatesDir).filter((name) => name.endsWith(".md"))) {
		const output = render(readFileSync(join(templatesDir, file), "utf8"), context, `templates/${file}`);
		const target = outputPathFor(file);
		const relative = target.slice(rootDir.length + 1);
		if (check) {
			if (!existsSync(target) || readFileSync(target, "utf8") !== output) stale.push(relative);
			continue;
		}
		writeFileSync(target, output, "utf8");
		console.log(`templates/${file} -> ${relative}`);
	}
	if (stale.length > 0) {
		console.error(`Out of date: ${stale.join(", ")}. Run 'bun run generate:readme' and commit the result.`);
		process.exit(1);
	}
}
