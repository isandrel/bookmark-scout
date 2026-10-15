import { UPCOMING_STORE_BROWSERS } from "@/lib/content/install";
import { site } from "@bookmark-scout/config";

/**
 * FAQ entries in display order. Each id has `q` and `a` under `home.faq.items.<id>`. An entry
 * with `shown` appears only while it returns true, so answers about store listings disappear
 * once `[stores]` in config/project.toml lists them.
 */
const FAQ_ENTRIES = [
    { id: "data" },
    { id: "needAi" },
    { id: "providers" },
    { id: "changes" },
    // Names Firefox and Edge as coming soon; update the copy if only one of them goes live.
    { id: "otherBrowsers", shown: () => UPCOMING_STORE_BROWSERS.length > 0 },
    { id: "stores", shown: () => !site.anyStoreLive },
    { id: "free" },
    { id: "who" },
    { id: "help" },
] as const satisfies readonly { id: string; shown?: () => boolean }[];

export type FaqItemId = (typeof FAQ_ENTRIES)[number]["id"];

/** The FAQ entries to show now. */
export const FAQ_ITEMS: readonly FaqItemId[] = FAQ_ENTRIES.filter((entry) => !("shown" in entry) || entry.shown()).map(
    (entry) => entry.id,
);
