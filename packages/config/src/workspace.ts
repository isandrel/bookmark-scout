/**
 * Schemas for the workspace config files and the one loader that reads them. This is the only
 * code that touches `config/*.toml`; everything else goes through the validated values.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import {
	boolean,
	type Check,
	ConfigError,
	color,
	email,
	expectKeys,
	type Infer,
	isoDate,
	isoDateTime,
	type Issues,
	list,
	number,
	record,
	table,
	text,
	url,
} from "./schema";

/** Folder at the repository root that holds the workspace config files. */
export const CONFIG_DIR = "config";

export const CONFIG_FILES = {
	/** Project identity, shared by every app and the README. */
	project: "project.toml",
	/** Website and docs hosting, read by the sites and the README only. */
	web: "web.toml",
} as const;

const slug = text({ pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/, hint: "lowercase words joined by hyphens" });
const localeCode = text({ pattern: /^[a-z]{2,3}(-[A-Z]{2})?$/, hint: "a language code such as en or pt-BR" });

const projectSchema = table({
	project: table({ name: text(), slug, description: text() }),
	author: table({ name: text(), url: url() }),
	repository: table({ url: url({ kind: "base" }), default_branch: text() }),
	license: table({ spdx: text(), url: url(), file: text() }),
	locales: table({
		default: localeCode,
		supported: list(localeCode, { minLength: 1, unique: true }),
		extension: list(localeCode, { minLength: 1, unique: true }),
		names: record(text()),
		og: record(text({ pattern: /^[a-z]{2,3}_[A-Z]{2}$/, hint: "an Open Graph locale such as en_US" })),
	}),
	browsers: table({ supported: list(slug, { minLength: 1, unique: true }), names: record(text()) }),
	stores: record(table({ name: text(), url: url({ allowEmpty: true }) })),
	contact: table({ privacy: email, security: email, support: email }),
	legal: table({ privacy_effective_date: isoDate }),
	offer: table({ price: text({ pattern: /^\d+(\.\d+)?$/, hint: "a decimal number" }), currency: text({ pattern: /^[A-Z]{3}$/, hint: "an ISO 4217 code such as USD" }) }),
});

const webSchema = table({
	website: table({
		url: url({ kind: "origin" }),
		domains: list(text({ pattern: /^[a-z0-9.-]+$/, hint: "a host name" }), { minLength: 1, unique: true }),
		analytics: table({
			enabled: boolean,
			provider: text(),
			script_url: url(),
			website_id: text({ allowEmpty: true }),
			about_url: url(),
			metrics_url: url(),
		}),
		theme: table({ light: color, dark: color, accent: color }),
	}),
	hosting: table({ privacy_url: url() }),
	docs: table({
		name: text(),
		url: url({ kind: "origin" }),
		description: text(),
		sitemap: table({
			change_frequency: text({
				pattern: /^(always|hourly|daily|weekly|monthly|yearly|never)$/,
				hint: "a sitemap change frequency such as weekly",
			}),
			home_priority: number({ min: 0, max: 1 }),
			page_priority: number({ min: 0, max: 1 }),
		}),
	}),
	security_txt: table({ expires: isoDateTime, warn_days: number({ min: 1 }) }),
});

export type ProjectConfig = Infer<typeof projectSchema>;
export type WebConfig = Infer<typeof webSchema>;
export type WorkspaceConfig = { project: ProjectConfig; web: WebConfig };

/** Rules that span several tables: every locale and browser list must agree. */
function checkProject(config: ProjectConfig, issues: Issues): void {
	const { locales, browsers, stores } = config;
	for (const list of ["supported", "extension"] as const) {
		if (!locales[list].includes(locales.default)) {
			issues.push(`locales.default: "${locales.default}" is not in locales.${list}`);
		}
	}
	expectKeys("locales.names", Object.keys(locales.names), locales.supported, issues);
	expectKeys("locales.og", Object.keys(locales.og), locales.supported, issues);
	expectKeys("browsers.names", Object.keys(browsers.names), browsers.supported, issues);
	expectKeys("stores", Object.keys(stores), browsers.supported, issues);
}

function checkWeb(config: WebConfig, issues: Issues): void {
	const { analytics } = config.website;
	if (analytics.enabled && !analytics.website_id.trim()) {
		issues.push("website.analytics.website_id: required while analytics is enabled");
	}
}

/** Parses one TOML file and validates it; throws a ConfigError listing every issue. */
export function parseConfigFile<T>(
	file: string,
	source: string,
	schema: Check<T>,
	extra?: (config: T, issues: Issues) => void,
): T {
	let raw: unknown;
	try {
		raw = parse(source);
	} catch (error) {
		throw new ConfigError(file, [error instanceof Error ? error.message : String(error)]);
	}
	const issues: Issues = [];
	const config = schema(raw, "", issues);
	if (issues.length === 0) extra?.(config, issues);
	if (issues.length > 0) throw new ConfigError(file, issues);
	return config;
}

export const parseProjectConfig = (source: string, file: string = CONFIG_FILES.project) =>
	parseConfigFile(file, source, projectSchema, checkProject);

export const parseWebConfig = (source: string, file: string = CONFIG_FILES.web) =>
	parseConfigFile(file, source, webSchema, checkWeb);

/**
 * The repository's `config/` folder, found by walking up from this package and from the
 * working directory. Covers the package itself, a bundled copy inside an app's build output,
 * and scripts run from the root or from any app (`apps/<app>`).
 */
export function findConfigDir(starts: readonly string[] = [dirname(fileURLToPath(import.meta.url)), process.cwd()]): string {
	for (const start of starts) {
		let dir = resolve(start);
		for (;;) {
			const candidate = join(dir, CONFIG_DIR);
			if (existsSync(join(candidate, CONFIG_FILES.project))) return candidate;
			const parent = dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
	}
	throw new Error(
		`Cannot find ${CONFIG_DIR}/${CONFIG_FILES.project}. Searched upward from:\n${starts.map((start) => `  - ${start}`).join("\n")}`,
	);
}

/** Reads and validates both workspace files. */
export function readWorkspaceConfig(dir: string = findConfigDir()): WorkspaceConfig {
	const read = (name: string) => readFileSync(join(dir, name), "utf8");
	return {
		project: parseProjectConfig(read(CONFIG_FILES.project), `${CONFIG_DIR}/${CONFIG_FILES.project}`),
		web: parseWebConfig(read(CONFIG_FILES.web), `${CONFIG_DIR}/${CONFIG_FILES.web}`),
	};
}
