import { RELEASES_URL, STORES, type StoreBrowser } from "@bookmark-scout/config";

export type DownloadTarget = { href: string; source: "store" | "release" };

/** Store listing for the browser when it is live, otherwise the latest GitHub release. */
export function downloadTarget(browser: StoreBrowser): DownloadTarget {
    const store = STORES[browser];
    return store ? { href: store, source: "store" } : { href: RELEASES_URL, source: "release" };
}

/** True when at least one store listing is live. */
export const ANY_STORE_LIVE = Object.values(STORES).some(Boolean);
