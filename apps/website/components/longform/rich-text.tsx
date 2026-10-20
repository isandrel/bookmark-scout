import type { RichTranslationValues } from "next-intl";
import type { ReactNode } from "react";

/** Inline link style for long-form copy: teal text with an underline that firms up on hover. */
export const PROSE_LINK_CLASS =
    "font-medium text-teal underline decoration-teal/40 underline-offset-4 transition-colors hover:decoration-teal";

/**
 * Tags for `t.rich` in long-form copy. `links` maps tag names to URLs. `emails` maps value
 * names to addresses: each address is passed as a value and gets a mailto tag named
 * `<name>Link`, so copy writes `<privacyEmailLink>{privacyEmail}</privacyEmailLink>`.
 */
export function proseTags({
    links = {},
    emails = {},
    values = {},
}: {
    links?: Record<string, string>;
    emails?: Record<string, string>;
    values?: Record<string, string>;
}): RichTranslationValues {
    const linkTags = Object.fromEntries(
        Object.entries(links).map(([tag, href]) => [
            tag,
            (chunks: ReactNode) => (
                <a href={href} className={PROSE_LINK_CLASS}>
                    {chunks}
                </a>
            ),
        ]),
    );
    const emailTags = Object.fromEntries(
        Object.entries(emails).map(([name, address]) => [
            `${name}Link`,
            (chunks: ReactNode) => (
                <a href={`mailto:${address}`} className={`${PROSE_LINK_CLASS} break-words`}>
                    {chunks}
                </a>
            ),
        ]),
    );

    return {
        ...values,
        ...emails,
        ...linkTags,
        ...emailTags,
        strong: (chunks: ReactNode) => <strong className="font-semibold text-ink">{chunks}</strong>,
        code: (chunks: ReactNode) => (
            <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[0.85em]">{chunks}</code>
        ),
    };
}

/**
 * Korean text wraps between words, not between syllables. `overflow-wrap: anywhere` still
 * breaks a long token (an email or URL) rather than letting it overflow.
 */
export function localeTextClass(locale: string): string {
    return locale === "ko" ? "break-keep [overflow-wrap:anywhere]" : "";
}
