/** Search keywords for the landing page metadata. Copy-level SEO, so it lives outside components. */
export const SITE_KEYWORDS = [
    "browser extension",
    "chrome extension",
    "firefox addon",
    "edge extension",
    "bookmark manager",
    "bookmark search",
    "bookmark organizer",
    "bookmark cleanup",
    "duplicate bookmarks",
    "dead links",
    "AI bookmark tools",
] as const;

/** Open Graph locale codes for each site locale. */
export const OG_LOCALES: Record<string, string> = {
    en: "en_US",
    ja: "ja_JP",
    ko: "ko_KR",
};
