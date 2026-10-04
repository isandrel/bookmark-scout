#!/usr/bin/env bun
/// <reference types="bun" />
/**
 * Generates README.md and translations/README.<locale>.md from templates/.
 *
 * Values come from the workspace config through `@bookmark-scout/config`, and library
 * versions from the installed packages, so the READMEs never hold a hand-typed copy.
 *
 *   bun run generate:readme
 *
 * Placeholders:
 *   {{NAME}}                 a value from `readmeValues()`
 *   {{VERSION:<package>}}    the installed package's release line ("bun" reads packageManager)
 *   {{VERSION:<workspace>:<package>}} the same, as installed for that workspace's package.json;
 *                            use it when workspaces pin different majors (TypeScript)
 *   {{BROWSER_BADGES:<label>}} one shields.io badge per supported browser, labelled <label>
 *
 * A placeholder that cannot be filled fails the run.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Site, site } from "@bookmark-scout/config";

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
	};
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

type RenderContext = {
	values: Record<string, string>;
	version: (name: string, workspace?: string) => string;
	browserBadges: (label: string) => string;
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

if (import.meta.main) {
	const context: RenderContext = {
		values: readmeValues(),
		version: (name, workspace) => installedVersion(name, rootDir, workspace),
		browserBadges: (label) => browserBadges(label),
	};
	for (const file of readdirSync(templatesDir).filter((name) => name.endsWith(".md"))) {
		const output = render(readFileSync(join(templatesDir, file), "utf8"), context, `templates/${file}`);
		const target = outputPathFor(file);
		writeFileSync(target, output, "utf8");
		console.log(`templates/${file} -> ${target.slice(rootDir.length + 1)}`);
	}
}
