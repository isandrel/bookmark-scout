import { LIVE_STORE_BROWSERS } from "@/lib/content/install";
import { site } from "@bookmark-scout/config";

export type DownloadTarget =
    | { source: "store"; href: string; browser: string }
    | { source: "release"; href: string };

/** The main install link: the first live store listing in install order, else the latest GitHub release. */
export function primaryDownload(): DownloadTarget {
    const first = LIVE_STORE_BROWSERS[0];
    return first
        ? { source: "store", href: site.store(first.id).url, browser: first.id }
        : { source: "release", href: site.repo.releasesLatest };
}
