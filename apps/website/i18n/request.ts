import { fillShortcutPlaceholders, readShortcutConfig } from '@bookmark-scout/config';
import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

const PAGE_MESSAGE_DIRS = ['privacy', 'support'] as const;

/** Keys come from the extension's shortcuts file; messages name them as {{SHORTCUT:<id>}}. */
const shortcuts = readShortcutConfig();

/** The messages with every shortcut placeholder replaced by the configured keys. */
function withShortcuts(value: unknown): unknown {
    if (typeof value === 'string') return fillShortcutPlaceholders(value, shortcuts);
    if (Array.isArray(value)) return value.map(withShortcuts);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, withShortcuts(entry)]));
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

    return {
        locale,
        messages: withShortcuts(Object.assign({}, ...files.map((file) => file.default))) as Record<string, unknown>,
    };
});
