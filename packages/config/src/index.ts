/**
 * @bookmark-scout/config
 *
 * Centralized configuration for all Bookmark Scout apps.
 * Reads from config/site.config.toml at the monorepo root.
 *
 * @example
 * import { SITE_NAME, SITE_URL, AUTHOR, GITHUB_URL } from "@bookmark-scout/config";
 */

import { parse } from "smol-toml";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Site configuration schema
 */
export interface SiteConfig {
	site: {
		name: string;
		url: string;
		description: string;
	};
	author: {
		name: string;
		url: string;
	};
	github: {
		url: string;
	};
	locales: {
		supported: string[];
		default: string;
	};
	docs: {
		name: string;
		url: string;
	};
	analytics?: {
		website?: {
			enabled: boolean;
			provider: string;
			website_id: string;
			script_url: string;
		};
		docs?: {
			enabled: boolean;
			provider: string;
			website_id: string;
			script_url: string;
		};
	};
}

/**
 * Find and read the config file from multiple possible locations
 */
function findConfigFile(): string {
	// Try multiple paths to find the config file
	const possiblePaths = [
		// From packages/config/src (development)
		resolve(__dirname, "../../../config/site.config.toml"),
		// From packages/config (built)
		resolve(__dirname, "../../config/site.config.toml"),
		// From apps/website (Next.js)
		resolve(process.cwd(), "../../config/site.config.toml"),
		// From apps/extension (WXT)
		resolve(process.cwd(), "../../config/site.config.toml"),
		// From monorepo root
		resolve(process.cwd(), "config/site.config.toml"),
	];

	for (const configPath of possiblePaths) {
		try {
			const content = readFileSync(configPath, "utf-8");
			return content;
		} catch {
			// Try next path
		}
	}

	throw new Error(
		`Failed to read site configuration. ` +
			`Make sure config/site.config.toml exists at the monorepo root. ` +
			`Searched paths:\n${possiblePaths.map((p) => `  - ${p}`).join("\n")}`,
	);
}

// Parse the config file
const tomlContent = findConfigFile();
const config = parse(tomlContent) as unknown as SiteConfig;

// Validate required fields
if (!config.site?.name) {
	throw new Error("config/site.config.toml: site.name is required");
}
if (!config.site?.url) {
	throw new Error("config/site.config.toml: site.url is required");
}
if (!config.author?.name) {
	throw new Error("config/site.config.toml: author.name is required");
}
if (!config.github?.url) {
	throw new Error("config/site.config.toml: github.url is required");
}

// ============================================================================
// Exports
// ============================================================================

/** Full configuration object */
export default config;

/** Site name (e.g., "Bookmark Scout") */
export const SITE_NAME = config.site.name;

/** Site URL (e.g., "https://bookmark-scout.com") */
export const SITE_URL = config.site.url;

/** Site description */
export const SITE_DESCRIPTION = config.site.description;

/** Author information */
export const AUTHOR = config.author;

/** GitHub repository URL */
export const GITHUB_URL = config.github.url;

/** Supported locales */
export const LOCALES = config.locales.supported;

/** Default locale */
export const DEFAULT_LOCALE = config.locales.default;

/** Locale type */
export type Locale = (typeof LOCALES)[number];

/** Docs site name */
export const DOCS_NAME = config.docs?.name ?? "Docs";

/** Docs site URL */
export const DOCS_URL = config.docs?.url ?? "https://docs.bookmark-scout.com";

// ============================================================================
// Analytics Configuration
// ============================================================================

/** Analytics config for main website (bookmark-scout.com) */
export const ANALYTICS_WEBSITE = config.analytics?.website ?? {
	enabled: false,
	provider: "umami",
	website_id: "",
	script_url: "",
};

/** Whether website analytics is enabled */
export const UMAMI_ENABLED = ANALYTICS_WEBSITE.enabled;

/** Umami website ID for main website */
export const UMAMI_WEBSITE_ID = ANALYTICS_WEBSITE.website_id;

/** Umami script URL */
export const UMAMI_SCRIPT_URL = ANALYTICS_WEBSITE.script_url;

/** Analytics config for docs site (docs.bookmark-scout.com) */
export const ANALYTICS_DOCS = config.analytics?.docs ?? {
	enabled: false,
	provider: "umami",
	website_id: "",
	script_url: "",
};
