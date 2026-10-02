import { CONTACT, GITHUB_URL, LICENSE } from "@bookmark-scout/config";

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
export const PRIVACY_GLANCE = ["noServer", "noTelemetry", "aiOptIn", "developer"] as const;

/**
 * Link targets for the tags used in the policy copy (`<permissions>…</permissions>` and so on).
 * Third-party pages are the sources the website section was checked against.
 */
export const PRIVACY_LINKS = {
    permissions: `${GITHUB_URL}#-permissions`,
    securityPolicy: `${GITHUB_URL}/blob/main/SECURITY.md`,
    source: GITHUB_URL,
    license: LICENSE.url,
    umami: "https://umami.is/",
    umamiDocs: "https://docs.umami.is/docs/metric-definitions",
    cloudflare: "https://www.cloudflare.com/privacypolicy/",
} as const;

/** Email addresses passed to the policy copy as `{privacyEmail}` and `{securityEmail}`. */
export const PRIVACY_EMAILS = {
    privacyEmail: CONTACT.privacy,
    securityEmail: CONTACT.security,
} as const;
