/**
 * @bookmark-scout/config
 *
 * The workspace config (`config/project.toml` and `config/web.toml`), validated once and
 * exposed as a site model. Server and build code only: it reads files with `node:fs`, so
 * client components receive values as props.
 *
 * @example
 * import { site } from "@bookmark-scout/config";
 * site.url.page("ja", "/privacy"); // https://bookmark-scout.com/ja/privacy/
 * site.repo.file("SECURITY.md");   // https://github.com/<owner>/<repo>/blob/main/SECURITY.md
 */
import { createSite } from "./site";
import { readWorkspaceConfig } from "./workspace";

export { ConfigError } from "./schema";
export {
	type ContactRole,
	createSite,
	joinUrl,
	PUBLIC_PATHS,
	type Site,
	type StoreListing,
	TITLE_SEPARATOR,
	titleTemplate,
	withSiteName,
} from "./site";
export {
	CONFIG_DIR,
	CONFIG_FILES,
	findConfigDir,
	type ProjectConfig,
	parseProjectConfig,
	parseWebConfig,
	readWorkspaceConfig,
	type WebConfig,
	type WorkspaceConfig,
} from "./workspace";

/** The validated workspace config files. Prefer `site`; this is for generators that need raw values. */
export const workspaceConfig = readWorkspaceConfig();

/** Every site value and URL builder. */
export const site = createSite(workspaceConfig.project, workspaceConfig.web);

export const SITE_NAME = site.name;
export const SITE_URL = site.url.origin;
export const LOCALES = site.locales.supported;
export const DEFAULT_LOCALE = site.locales.default;

// ----------------------------------------------------------------------------
// Earlier flat exports, derived from `site` until every caller uses the model.
// ----------------------------------------------------------------------------

export const SITE_DESCRIPTION = site.description;
export const AUTHOR = site.author;
export const GITHUB_URL = site.repo.base;
export const LICENSE = { name: site.license.spdx, url: site.license.fileUrl } as const;
export const CONTACT = {
	privacy: site.contact.address("privacy"),
	security: site.contact.address("security"),
	support: site.contact.address("support"),
} as const;
export const WEBSITE_DOMAINS = site.domains;
export const STORES: Readonly<Record<string, string>> = Object.fromEntries(
	site.stores.map((listing) => [listing.browser, listing.url]),
);
export type StoreBrowser = string;
export type Locale = string;
export const RELEASES_URL = site.repo.releasesLatest;
export const PRIVACY_EFFECTIVE_DATE = site.legal.privacyEffectiveDate;
export const DOCS_NAME = site.docs.name;
export const DOCS_URL = site.docs.origin;
export const UMAMI_ENABLED = site.analytics.enabled;
export const UMAMI_WEBSITE_ID = site.analytics.websiteId;
export const UMAMI_SCRIPT_URL = site.analytics.scriptUrl;
