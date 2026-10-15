import { site } from "@bookmark-scout/config";

/**
 * Privacy policy sections in display order. Copy lives in messages under
 * `privacyPage.sections.<id>` (a `title` and prose `blocks`); the id is also the heading anchor.
 */
export const PRIVACY_SECTIONS = [
    "summary",
    "what-the-extension-reads",
    "what-the-extension-stores",
    "when-data-leaves-your-browser",
    "what-the-developer-receives",
    "permissions",
    "websites",
    "children",
    "changes",
    "contact",
] as const;

export type PrivacySectionId = (typeof PRIVACY_SECTIONS)[number];

/** "At a glance" facts. Copy lives under `privacyPage.glance.<id>` (`title`, `body`). */
export const PRIVACY_GLANCE = ["noServer", "noTelemetry", "aiOptIn", "developer", "permissions"] as const;

/** Docs page that lists each permission, the browser's own prompt, and why. */
export const PERMISSIONS_DOCS_PATH = "/permissions";

/**
 * Link targets for the tags used in the policy copy (`<securityPolicy>…</securityPolicy>` and so
 * on). Third-party pages are the sources the website section was checked against.
 */
export const PRIVACY_LINKS = {
    securityPolicy: site.repo.file("SECURITY.md"),
    source: site.repo.url(),
    license: site.license.fileUrl,
    umami: site.analytics.aboutUrl,
    umamiDocs: site.analytics.metricsUrl,
    cloudflare: site.hosting.privacyUrl,
} as const;

/** The policy's links in one language: the docs permissions page is localized. */
export const privacyLinks = (locale: string) => ({
    ...PRIVACY_LINKS,
    permissions: site.docs.page(locale, PERMISSIONS_DOCS_PATH),
});

/** Email addresses passed to the policy copy as `{privacyEmail}` and `{securityEmail}`. */
export const PRIVACY_EMAILS = {
    privacyEmail: site.contact.address("privacy"),
    securityEmail: site.contact.address("security"),
} as const;
