import {
    fillShortcutPlaceholders,
    parseShortcutNotes,
    readShortcutConfig,
    type ShortcutNotes,
} from '@bookmark-scout/config';
import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

const PAGE_MESSAGE_DIRS = ['privacy', 'support'] as const;

/**
 * Keys come from the extension's shortcuts file; messages name them as {{SHORTCUT:<id>}}, which
 * prints the primary platform's keys and the other platform's in parentheses, each named as
 * `shortcutNotes` in the same language words it, as plain text at the size of the text around it.
 */
const shortcuts = readShortcutConfig();

/** The messages with every shortcut placeholder replaced by the configured keys. */
function withShortcuts(value: unknown, notes: ShortcutNotes): unknown {
    if (typeof value === 'string') return fillShortcutPlaceholders(value, shortcuts, notes);
    if (Array.isArray(value)) return value.map((entry) => withShortcuts(entry, notes));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, withShortcuts(entry, notes)]));
    }
    return value;
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
    // A missing or malformed note fails the build.
    const notes = parseShortcutNotes(messages.shortcutNotes, `messages/${locale}.json`);
    return { locale, messages: withShortcuts(messages, notes) as Record<string, unknown> };
});
