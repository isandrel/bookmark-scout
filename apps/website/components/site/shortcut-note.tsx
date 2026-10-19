import type { ReactNode } from "react";

/**
 * The `<shortcutNote>` tag that `{{SHORTCUT:<id>}}` puts around the secondary platform's keys
 * (`i18n/request.ts`): smaller and softer than the primary keys before it. Every tag set for
 * `t.rich` includes it, so any message can name a shortcut.
 */
export const shortcutNoteTag = {
    shortcutNote: (chunks: ReactNode) => <small className="text-[0.85em] text-ink-soft">{chunks}</small>,
};
