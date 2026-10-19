import {
    fillShortcutPlaceholders,
    readShortcutConfig,
    type ShortcutNoteFormat,
    type ShortcutNotes,
} from '@bookmark-scout/config';
import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

const PAGE_MESSAGE_DIRS = ['privacy', 'support'] as const;

/**
 * Keys come from the extension's shortcuts file; messages name them as {{SHORTCUT:<id>}}, which
 * prints the primary platform's keys and the other platform's in a `<shortcutNote>` tag
 * (`shortcutNoteTag`), worded by `shortcutNotes` in the same language.
 */
const shortcuts = readShortcutConfig();

/** The messages with every shortcut placeholder replaced by the configured keys. */
function withShortcuts(value: unknown, format: ShortcutNoteFormat): unknown {
    if (typeof value === 'string') return fillShortcutPlaceholders(value, shortcuts, format);
    if (Array.isArray(value)) return value.map((entry) => withShortcuts(entry, format));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, withShortcuts(entry, format)]));
    }
    return value;
}

/** The language's notes for the secondary platform's keys; a missing note fails the build. */
function shortcutNotes(messages: Record<string, unknown>, locale: string): ShortcutNotes {
    const notes = messages.shortcutNotes as Partial<Record<string, unknown>> | undefined;
    if (typeof notes?.mac !== 'string' || typeof notes.other !== 'string') {
        throw new Error(`messages/${locale}.json: expected "shortcutNotes": { "mac": "...", "other": "..." }`);
    }
    return { mac: notes.mac, other: notes.other };
}

export default getRequestConfig(async ({ requestLocale }) => {
    // Typically corresponds to the `[locale]` segment
    const requested = await requestLocale;
    const locale = hasLocale(routing.locales, requested)
        ? requested
        : routing.defaultLocale;

    // Long-form pages keep their copy in messages/<page>/<locale>.json.
    const files = await Promise.all([
        import(`../messages/${locale}.json`),
        ...PAGE_MESSAGE_DIRS.map((dir) => import(`../messages/${dir}/${locale}.json`)),
    ]);

    const messages = Object.assign({}, ...files.map((file) => file.default)) as Record<string, unknown>;
    const format: ShortcutNoteFormat = {
        notes: shortcutNotes(messages, locale),
        note: (note) => `<shortcutNote>${note}</shortcutNote>`,
    };
    return { locale, messages: withShortcuts(messages, format) as Record<string, unknown> };
});
