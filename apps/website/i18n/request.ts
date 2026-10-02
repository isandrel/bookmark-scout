import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

const PAGE_MESSAGE_DIRS = ['privacy', 'support'] as const;

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
        messages: Object.assign({}, ...files.map((file) => file.default)),
    };
});
