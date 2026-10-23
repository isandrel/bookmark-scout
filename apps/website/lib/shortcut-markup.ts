import type { ShortcutMarkup } from "@bookmark-scout/config";

/**
 * Rich-text tags that a filled `{{SHORTCUT:<id>}}` uses in the messages: `kbd` around each
 * platform's keys (one key cap per way to press it, as the docs print them) and `shortcut` around
 * the whole text, labels included. `components/ShortcutKeys.tsx` renders them for `t.rich`.
 */
export const SHORTCUT_TAGS = { keys: "kbd", shortcut: "shortcut" } as const;

export const shortcutMarkup: ShortcutMarkup = {
    keys: (keys) => `<${SHORTCUT_TAGS.keys}>${keys}</${SHORTCUT_TAGS.keys}>`,
    shortcut: (text) => `<${SHORTCUT_TAGS.shortcut}>${text}</${SHORTCUT_TAGS.shortcut}>`,
};
