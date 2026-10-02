import { CONTACT, DOCS_URL, GITHUB_URL } from "@bookmark-scout/config";
import { PRIVACY_LINKS } from "./privacy-sections";

/**
 * Support page sections in display order. Copy lives in messages under
 * `supportPage.sections.<id>`; the id is also the heading anchor.
 */
export const SUPPORT_SECTIONS = ["start-here", "common-problems", "report-a-bug", "email"] as const;

/** Self-serve starting points. Copy: `sections.start-here.items.<id>` (`title`, `body`). */
export const SUPPORT_START = [
    { id: "docs", href: () => DOCS_URL },
    { id: "faq", href: (locale: string) => `/${locale}/#faq` },
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

/** GitHub's issue form chooser (`.github/ISSUE_TEMPLATE/`). */
export const ISSUE_CHOOSER_URL = `${GITHUB_URL}/issues/new/choose`;

/** What a bug report should contain. Copy: `sections.report-a-bug.include.<id>`. */
export const REPORT_DETAILS = ["browser", "version", "steps", "result", "screenshot"] as const;

/** Role mailboxes in display order. Copy: `sections.email.channels.<id>` (`title`, `body`). */
export const SUPPORT_CHANNELS = [
    { id: "support", email: CONTACT.support },
    { id: "privacy", email: CONTACT.privacy },
    { id: "security", email: CONTACT.security },
] as const;

/** Link targets for tags in the email copy. `privacyPolicy` is locale-aware. */
export const supportLinks = (locale: string) => ({
    privacyPolicy: `/${locale}/privacy/`,
    securityPolicy: PRIVACY_LINKS.securityPolicy,
    securityTxt: "/.well-known/security.txt",
});
