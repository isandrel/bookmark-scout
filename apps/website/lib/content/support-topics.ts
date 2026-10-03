import { type ContactRole, PUBLIC_PATHS, site } from "@bookmark-scout/config";
import { PRIVACY_LINKS } from "./privacy-sections";

/**
 * Support page sections in display order. Copy lives in messages under
 * `supportPage.sections.<id>`; the id is also the heading anchor.
 */
export const SUPPORT_SECTIONS = ["start-here", "common-problems", "report-a-bug", "email"] as const;

/** Self-serve starting points. Copy: `sections.start-here.items.<id>` (`title`, `body`). */
export const SUPPORT_START = [
    { id: "docs", href: () => site.docs.url() },
    { id: "faq", href: (locale: string) => site.url.path(locale, "", "faq") },
] as const;

/**
 * Troubleshooting answers, grounded in the docs status page and `store/README.md`.
 * Copy: `sections.common-problems.items.<id>` (`q`, and `a` as a list of paragraphs).
 */
export const SUPPORT_PROBLEMS = [
    "firefoxRestart",
    "firefoxManager",
    "firefoxIcons",
    "websiteAccess",
    "aiSetup",
] as const;

/** What a bug report should contain. Copy: `sections.report-a-bug.include.<id>`. */
export const REPORT_DETAILS = ["browser", "version", "steps", "result", "screenshot"] as const;

/**
 * Role mailboxes in display order, on the support page and in the footer.
 * Copy: `sections.email.channels.<role>` (`title`, `body`).
 */
export const CONTACT_ROLES: readonly ContactRole[] = ["support", "privacy", "security"];

/** Link targets for tags in the email copy. `privacyPolicy` is locale-aware. */
export const supportLinks = (locale: string) => ({
    privacyPolicy: site.url.path(locale, "/privacy"),
    securityPolicy: PRIVACY_LINKS.securityPolicy,
    securityTxt: PUBLIC_PATHS.securityTxt,
});
