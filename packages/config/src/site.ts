/**
 * The site model: every URL, address, and label the apps need, built from the validated
 * workspace config. Callers ask for `site.url.page("ja", "/privacy")` or
 * `site.repo.file("SECURITY.md")` instead of concatenating strings, so a URL shape is defined
 * in exactly one place.
 */
import type { ProjectConfig, WebConfig } from "./workspace";

/** Root-relative paths both sites serve from `public/`. */
export const PUBLIC_PATHS = {
	icon: "/icon.png",
	securityTxt: "/.well-known/security.txt",
	sitemap: "/sitemap.xml",
} as const;

/** Separator between a page title and the site name, as in "Privacy | Bookmark Scout". */
export const TITLE_SEPARATOR = " | ";

/** A Next.js title template that appends `siteName`. */
export const titleTemplate = (siteName: string) => `%s${TITLE_SEPARATOR}${siteName}`;

/** `title` followed by the site name, the way the title template renders it. */
export const withSiteName = (title: string, siteName: string) => `${title}${TITLE_SEPARATOR}${siteName}`;

export type ContactRole = keyof ProjectConfig["contact"];

export type StoreListing = {
	browser: string;
	/** Store name, a proper noun such as "Chrome Web Store". */
	name: string;
	/** True once the listing URL is set in config. */
	live: boolean;
	/** The listing URL, or `""` while it is not live. */
	url: string;
};

/**
 * Appends `path` to `base`. `""` returns `base`; `#anchor` and `?query` attach directly;
 * anything else is joined with exactly one slash.
 */
export function joinUrl(base: string, path = ""): string {
	if (path === "") return base;
	if (path.startsWith("#") || path.startsWith("?")) return `${base}${path}`;
	return `${base}/${path.replace(/^\/+/, "")}`;
}

/** A route is `""` (the locale home) or `/segment[/segment]` without a trailing slash. */
function assertRoute(route: string): void {
	if (route !== "" && !/^(\/[^/#?\s]+)+$/.test(route)) {
		throw new Error(`Invalid route "${route}": use "" or "/path" without a trailing slash`);
	}
}

export function createSite(project: ProjectConfig, web: WebConfig) {
	const { locales, browsers } = project;
	const origin = web.website.url;
	const repoBase = project.repository.url;
	const branch = project.repository.default_branch;
	const repoSlug = new URL(repoBase).pathname.replace(/^\/+/, "");

	const assertLocale = (locale: string) => {
		if (!locales.supported.includes(locale)) {
			throw new Error(`Unknown locale "${locale}"; supported: ${locales.supported.join(", ")}`);
		}
	};

	/** Root-relative path of a localized page. Trailing slash, as the static export serves it. */
	const path = (locale: string, route = "", anchor?: string) => {
		assertLocale(locale);
		assertRoute(route);
		return `/${locale}${route}/${anchor ? `#${anchor}` : ""}`;
	};

	const page = (locale: string, route = "", anchor?: string) => `${origin}${path(locale, route, anchor)}`;

	const repo = {
		/** Repository web URL, such as https://github.com/owner/name. */
		base: repoBase,
		/** `owner/name`. */
		slug: repoSlug,
		defaultBranch: branch,
		/** A page of the repository site, such as `/issues` or `#readme`. */
		url: (subpath = "") => joinUrl(repoBase, subpath),
		/** A file on the default branch, such as `SECURITY.md`. */
		file: (file: string) => joinUrl(repoBase, `blob/${branch}/${file.replace(/^\/+/, "")}`),
		/** A folder on the default branch. */
		tree: (folder: string) => joinUrl(repoBase, `tree/${branch}/${folder.replace(/^\/+/, "")}`),
		/** The raw contents of a file on the default branch (GitHub's raw host). */
		raw: (file: string) => `https://raw.githubusercontent.com/${repoSlug}/${branch}/${file.replace(/^\/+/, "")}`,
		releases: joinUrl(repoBase, "releases"),
		releasesLatest: joinUrl(repoBase, "releases/latest"),
		issues: joinUrl(repoBase, "issues"),
		/** The issue form chooser (`.github/ISSUE_TEMPLATE/`). */
		newIssue: joinUrl(repoBase, "issues/new/choose"),
		/** Private vulnerability reporting. */
		newSecurityAdvisory: joinUrl(repoBase, "security/advisories/new"),
	} as const;

	const stores: StoreListing[] = browsers.supported.map((browser) => {
		const entry = project.stores[browser];
		return { browser, name: entry.name, url: entry.url, live: entry.url !== "" };
	});

	const store = (browser: string): StoreListing => {
		const listing = stores.find((entry) => entry.browser === browser);
		if (!listing) throw new Error(`Unknown browser "${browser}"; supported: ${browsers.supported.join(", ")}`);
		return listing;
	};

	const contactRoles = Object.keys(project.contact) as ContactRole[];

	return {
		name: project.project.name,
		slug: project.project.slug,
		description: project.project.description,
		author: project.author,

		url: {
			/** Website origin without a trailing slash, such as https://bookmark-scout.com. */
			origin,
			path,
			page,
			/** hreflang alternates for a route: one URL per locale plus `x-default`. */
			alternates: (route = ""): Record<string, string> => ({
				...Object.fromEntries(locales.supported.map((locale) => [locale, page(locale, route)])),
				"x-default": page(locales.default, route),
			}),
			/** Absolute URL of a file the website serves, such as `/icon.png`. */
			asset: (file: string) => joinUrl(origin, file),
		},
		domains: web.website.domains,

		repo,

		docs: {
			name: web.docs.name,
			origin: web.docs.url,
			description: web.docs.description,
			/** A docs page; without a path, the docs home. */
			url: (subpath = "") => joinUrl(web.docs.url, subpath),
			sitemap: {
				changeFrequency: web.docs.sitemap.change_frequency,
				homePriority: web.docs.sitemap.home_priority,
				pagePriority: web.docs.sitemap.page_priority,
			},
		},

		locales: {
			default: locales.default,
			supported: locales.supported,
			isSupported: (locale: string) => locales.supported.includes(locale),
			/** The language's own name, such as 日本語. */
			name: (locale: string) => {
				assertLocale(locale);
				return locales.names[locale] ?? locale;
			},
			/** Open Graph locale code, such as ja_JP. */
			ogCode: (locale: string) => {
				assertLocale(locale);
				return locales.og[locale] ?? locale;
			},
		},

		browsers: {
			supported: browsers.supported,
			name: (browser: string) => {
				const name = browsers.names[browser];
				if (!name) throw new Error(`Unknown browser "${browser}"`);
				return name;
			},
		},

		stores,
		store,
		anyStoreLive: stores.some((entry) => entry.live),

		contact: {
			roles: contactRoles,
			address: (role: ContactRole) => project.contact[role],
			mailto: (role: ContactRole) => `mailto:${project.contact[role]}`,
		},

		license: {
			spdx: project.license.spdx,
			/** The license text. */
			url: project.license.url,
			/** The LICENSE file in the repository. */
			fileUrl: repo.file(project.license.file),
		},

		legal: { privacyEffectiveDate: project.legal.privacy_effective_date },
		offer: project.offer,

		analytics: {
			enabled: web.website.analytics.enabled,
			provider: web.website.analytics.provider,
			scriptUrl: web.website.analytics.script_url,
			websiteId: web.website.analytics.website_id,
			aboutUrl: web.website.analytics.about_url,
			metricsUrl: web.website.analytics.metrics_url,
		},
		theme: web.website.theme,
		hosting: { privacyUrl: web.hosting.privacy_url },
		securityTxt: {
			expires: web.security_txt.expires,
			warnDays: web.security_txt.warn_days,
			path: PUBLIC_PATHS.securityTxt,
			url: joinUrl(origin, PUBLIC_PATHS.securityTxt),
		},
	} as const;
}

export type Site = ReturnType<typeof createSite>;
