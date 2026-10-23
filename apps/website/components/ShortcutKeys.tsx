import type { ReactNode } from "react";
import { SHORTCUT_TAGS } from "@/lib/shortcut-markup";

/**
 * `t.rich` tags for keyboard shortcuts in messages (`i18n/request.ts` fills `{{SHORTCUT:<id>}}`
 * with them): each platform's keys as one key cap, styled by `.key-cap` in `app/globals.css`, and
 * the labels and parentheses as plain text at the size of the line around them.
 */
export const shortcutTags = {
    [SHORTCUT_TAGS.keys]: (chunks: ReactNode) => <kbd className="key-cap">{chunks}</kbd>,
    [SHORTCUT_TAGS.shortcut]: (chunks: ReactNode) => <span className="shortcut">{chunks}</span>,
};
