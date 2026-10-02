import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
    // Typically corresponds to the `[locale]` segment
    const requested = await requestLocale;
    const locale = hasLocale(routing.locales, requested)
        ? requested
        : routing.defaultLocale;

    // The privacy policy is long-form, so it lives in its own file per locale.
    const [site, privacy] = await Promise.all([
        import(`../messages/${locale}.json`),
        import(`../messages/privacy/${locale}.json`),
    ]);

    return {
        locale,
        messages: { ...site.default, ...privacy.default },
    };
});
