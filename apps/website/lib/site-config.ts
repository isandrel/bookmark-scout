/**
 * Site Configuration
 *
 * Reads configuration from config/site.config.toml at the project root.
 * Change the TOML file to update the domain across the entire site.
 */

import { parse } from "smol-toml";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface SiteConfig {
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
}

// Read and parse the TOML config file
const configPath = resolve(process.cwd(), "../../config/site.config.toml");

let config: SiteConfig;

try {
    const tomlContent = readFileSync(configPath, "utf-8");
    config = parse(tomlContent) as unknown as SiteConfig;
} catch (error) {
    throw new Error(
        `Failed to read site configuration from ${configPath}. ` +
        `Make sure config/site.config.toml exists at the project root. ` +
        `Error: ${error instanceof Error ? error.message : String(error)}`
    );
}

// Export individual values for convenience
export const SITE_URL = config.site.url;
export const SITE_NAME = config.site.name;
export const SITE_DESCRIPTION = config.site.description;

export const AUTHOR = config.author;
export const GITHUB_URL = config.github.url;

export const LOCALES = config.locales.supported;
export const DEFAULT_LOCALE = config.locales.default;

export type Locale = (typeof LOCALES)[number];

// Export the full config object
export default config;
