"use client";

import {
    bestLanguageMatch,
    LANGUAGE_CHOICE_EVENT,
    readLanguageChoice,
    rememberLanguageChoice,
} from "@/lib/language-preference";
import { type LocaleRouting, pathInLocale } from "@bookmark-scout/config/locale-path";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type KeyboardEvent, useEffect, useState } from "react";

/** The banner's copy, written in the language it suggests. */
export type LanguageSuggestionCopy = {
    /** Accessible name of the banner. */
    label: string;
    text: string;
    action: string;
    /** Accessible name of the close button. */
    dismiss: string;
};

/**
 * Offers this page in the visitor's browser language when it is another supported language.
 * It never redirects: the page stays in its own language for everyone, including crawlers,
 * and the banner appears only after load, as a fixed bar that shifts no content. Dismissing
 * it, following it, or picking a language in the header switcher is remembered, and then it
 * never shows again.
 */
export function LanguageSuggestion({
    currentLocale,
    routing,
    copy,
}: {
    currentLocale: string;
    routing: LocaleRouting;
    copy: Readonly<Record<string, LanguageSuggestionCopy>>;
}) {
    const pathname = usePathname();
    const [suggested, setSuggested] = useState<string>();

    useEffect(() => {
        if (readLanguageChoice() !== null) return;
        const match = bestLanguageMatch(navigator.languages ?? [navigator.language], routing.locales);
        // Browser languages are only known on the client, so the banner is set after hydration.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (match && match !== currentLocale) setSuggested(match);
    }, [currentLocale, routing.locales]);

    useEffect(() => {
        const hide = () => setSuggested(undefined);
        window.addEventListener(LANGUAGE_CHOICE_EVENT, hide);
        return () => window.removeEventListener(LANGUAGE_CHOICE_EVENT, hide);
    }, []);

    const text = suggested ? copy[suggested] : undefined;
    if (!suggested || !text) return null;

    const dismiss = () => rememberLanguageChoice(currentLocale);
    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") dismiss();
    };

    return (
        <aside
            lang={suggested}
            aria-label={text.label}
            onKeyDown={onKeyDown}
            className="fixed inset-x-4 bottom-4 z-50 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 pl-4 shadow-xl shadow-ink/10 motion-safe:animate-[suggestion-in_200ms_ease-out] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:max-w-lg"
        >
            <p className="min-w-0 flex-1 text-sm leading-snug text-ink [word-break:auto-phrase]">{text.text}</p>
            <Link
                href={pathInLocale(pathname, suggested, routing, { trailingSlash: true })}
                hrefLang={suggested}
                onClick={() => rememberLanguageChoice(suggested)}
                className="inline-flex min-h-10 shrink-0 items-center rounded-full bg-teal px-4 text-sm font-semibold text-teal-ink transition-[filter] hover:brightness-110"
            >
                {text.action}
            </Link>
            <button
                type="button"
                onClick={dismiss}
                aria-label={text.dismiss}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-sunken hover:text-ink"
            >
                <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4">
                    <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
            </button>
        </aside>
    );
}
