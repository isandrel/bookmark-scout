/**
 * The visitor's language preference, for the language suggestion banner. Client-safe: imports
 * nothing from `@bookmark-scout/config`, which reads files.
 */

/** The one browser storage key: the language the visitor chose, by switching or by dismissing the banner. */
export const LANGUAGE_CHOICE_KEY = "bookmark-scout:language";

/** The remembered choice, or `null` when there is none or storage is unavailable. */
export function readLanguageChoice(): string | null {
    try {
        return window.localStorage.getItem(LANGUAGE_CHOICE_KEY);
    } catch {
        return null;
    }
}

/** Fired on `window` when a choice is made, so an open banner closes even without storage. */
export const LANGUAGE_CHOICE_EVENT = "bookmark-scout:language-choice";

/** Remembers a choice; without storage (private mode, blocked site data) it is simply not kept. */
export function rememberLanguageChoice(locale: string): void {
    try {
        window.localStorage.setItem(LANGUAGE_CHOICE_KEY, locale);
    } catch {
        // Nothing to do: the banner may show again on the next visit.
    }
    window.dispatchEvent(new Event(LANGUAGE_CHOICE_EVENT));
}

/** Language, script, and region of a tag, with likely subtags filled in (`zh-HK` is Hant). */
function maximized(tag: string): { language: string; script?: string; region?: string } | undefined {
    try {
        const locale = new Intl.Locale(tag).maximize();
        return { language: locale.language, script: locale.script, region: locale.region };
    } catch {
        return undefined;
    }
}

/**
 * The supported language that best fits the visitor's first usable browser language, or
 * `undefined` when none fits. Each requested tag is tried in order: an exact match first, then
 * the same language and script (so `zh-HK` gets Traditional and `zh-SG` Simplified Chinese),
 * preferring the same region (`pt-PT` still gets `pt-BR` when that is the only Portuguese).
 * Only the first requested tag that fits anything counts: someone who lists English before
 * Japanese is not offered Japanese.
 */
export function bestLanguageMatch(requested: readonly string[], supported: readonly string[]): string | undefined {
    const candidates = supported.map((tag) => ({ tag, lower: tag.toLowerCase(), max: maximized(tag) }));
    for (const tag of requested) {
        const exact = candidates.find((candidate) => candidate.lower === tag.toLowerCase());
        if (exact) return exact.tag;
        const wanted = maximized(tag);
        if (!wanted) continue;
        const sameScript = candidates.filter(
            ({ max }) => max?.language === wanted.language && max.script === wanted.script,
        );
        const best = sameScript.find(({ max }) => max?.region === wanted.region) ?? sameScript[0];
        if (best) return best.tag;
    }
    return undefined;
}
