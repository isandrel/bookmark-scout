import { site } from "@bookmark-scout/config";

export type DownloadTarget = { href: string; source: "store" | "release" };

/** Store listing for the browser when it is live, otherwise the latest GitHub release. */
export function downloadTarget(browser: string): DownloadTarget {
    const store = site.store(browser);
    return store.live ? { href: store.url, source: "store" } : { href: site.repo.releasesLatest, source: "release" };
}
