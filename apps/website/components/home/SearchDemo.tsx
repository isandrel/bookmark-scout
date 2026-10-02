"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { DEMO_BOOKMARKS, DEMO_SETTINGS } from "@/lib/content/demo-bookmarks";

type Row = { title: string; url: string; path: string };

function splitTerms(query: string): string[] {
    return query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
}

/** Wraps every occurrence of every term in <mark>, merging overlaps. */
function highlight(text: string, terms: string[]) {
    if (terms.length === 0) return text;
    const lower = text.toLocaleLowerCase();
    const ranges: [number, number][] = [];
    for (const term of terms) {
        let from = lower.indexOf(term);
        while (from !== -1) {
            ranges.push([from, from + term.length]);
            from = lower.indexOf(term, from + term.length);
        }
    }
    if (ranges.length === 0) return text;
    ranges.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const range of ranges) {
        const last = merged[merged.length - 1];
        if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
        else merged.push([...range]);
    }
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    merged.forEach(([start, end]) => {
        if (start > cursor) parts.push(text.slice(cursor, start));
        parts.push(<mark key={start}>{text.slice(start, end)}</mark>);
        cursor = end;
    });
    if (cursor < text.length) parts.push(text.slice(cursor));
    return parts;
}

export function SearchDemo() {
    const t = useTranslations("home.demo");
    const inputId = useId();
    const chips = t.raw("chips") as string[];
    const autoQuery = t("autoQuery");

    const [query, setQuery] = useState("");
    const [autoTyping, setAutoTyping] = useState(false);
    const touched = useRef(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const rows = useMemo<Row[]>(
        () =>
            DEMO_BOOKMARKS.map((bookmark) => ({
                title: bookmark.title,
                url: bookmark.url,
                path: bookmark.folders.map((folder) => t(`folders.${folder}`)).join(" / "),
            })),
        [t],
    );

    const terms = useMemo(() => splitTerms(query), [query]);
    const matches = useMemo(
        () =>
            terms.length === 0
                ? rows
                : rows.filter((row) => {
                      const fields = [row.title, row.url, row.path].map((f) => f.toLocaleLowerCase());
                      return terms.every((term) => fields.some((field) => field.includes(term)));
                  }),
        [rows, terms],
    );

    // The page's one orchestrated motion: type a query once, unless the visitor acts first.
    useEffect(() => {
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const timers: number[] = [];
        const schedule = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));

        if (reduceMotion) {
            schedule(() => {
                if (!touched.current) setQuery(autoQuery);
            }, 0);
        } else {
            const chars = Array.from(autoQuery);
            schedule(() => {
                if (touched.current) return;
                setAutoTyping(true);
                chars.forEach((_, index) => {
                    schedule(() => {
                        if (touched.current) return;
                        setQuery(chars.slice(0, index + 1).join(""));
                        if (index === chars.length - 1) setAutoTyping(false);
                    }, DEMO_SETTINGS.typeStepMs * (index + 1));
                });
            }, DEMO_SETTINGS.typeStartDelayMs);
        }
        return () => timers.forEach((id) => window.clearTimeout(id));
    }, [autoQuery]);

    const takeOver = () => {
        touched.current = true;
        setAutoTyping(false);
    };

    const visible = matches.slice(0, DEMO_SETTINGS.visibleRows);
    const hidden = matches.length - visible.length;

    return (
        <div className="relative overflow-hidden rounded-[1.25rem] border border-line bg-surface shadow-[0_30px_60px_-30px_rgb(15_33_53/0.35)]">
            <span aria-hidden="true" className="ribbon absolute left-5 top-0 h-12 w-7 sm:left-7 sm:h-14 sm:w-8" />

            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4 pl-16 pr-5 sm:pl-20 sm:pr-7">
                <label htmlFor={inputId} className="text-sm font-medium text-ink-soft">
                    {t("label")}
                </label>
                <p aria-live="polite" className="text-sm tabular-nums text-ink-soft">
                    {t("count", { count: matches.length, total: rows.length })}
                </p>
            </div>

            <div className="px-5 sm:px-7">
                <div className="flex items-center gap-3 border-b-2 border-line transition-colors focus-within:border-teal">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 shrink-0 text-ink-soft sm:size-8">
                        <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
                        <path d="M15.5 15.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <div className="relative min-w-0 flex-1">
                        <input
                            ref={inputRef}
                            id={inputId}
                            type="search"
                            value={query}
                            onChange={(event) => {
                                takeOver();
                                setQuery(event.target.value);
                            }}
                            onFocus={takeOver}
                            placeholder={t("placeholder")}
                            autoComplete="off"
                            spellCheck={false}
                            className="w-full bg-transparent py-2 font-display text-[1.625rem] font-semibold tracking-tight text-ink placeholder:text-ink-soft/70 focus-visible:outline-none sm:text-[2.5rem] [&::-webkit-search-cancel-button]:hidden"
                        />
                        {autoTyping && (
                            <div
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-0 flex items-center overflow-hidden py-2 font-display text-[1.625rem] font-semibold tracking-tight sm:text-[2.5rem]"
                            >
                                <span className="invisible whitespace-pre">{query}</span>
                                <span className="caret" />
                            </div>
                        )}
                    </div>
                    {query && (
                        <button
                            type="button"
                            onClick={() => {
                                takeOver();
                                setQuery("");
                                inputRef.current?.focus();
                            }}
                            className="shrink-0 rounded-full p-2 text-ink-soft hover:bg-sunken hover:text-ink"
                        >
                            <span className="sr-only">{t("clear")}</span>
                            <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4">
                                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                        </button>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2 py-4">
                    <span className="mr-1 text-sm text-ink-soft" id={`${inputId}-try`}>
                        {t("try")}
                    </span>
                    {chips.map((chip) => (
                        <button
                            key={chip}
                            type="button"
                            aria-pressed={query === chip}
                            aria-describedby={`${inputId}-try`}
                            onClick={() => {
                                takeOver();
                                setQuery(chip);
                            }}
                            className="rounded-full border border-line px-3 py-1 font-mono text-sm text-ink-soft transition-colors hover:border-teal hover:text-ink aria-pressed:border-teal aria-pressed:bg-teal aria-pressed:text-teal-ink"
                        >
                            {chip}
                        </button>
                    ))}
                </div>
            </div>

            <div className="min-h-[29rem] border-t border-line sm:min-h-[22.5rem]">
                {matches.length === 0 ? (
                    <div className="px-5 py-8 sm:px-7">
                        <p className="font-medium">{t("emptyTitle", { query: query.trim() })}</p>
                        <p className="mt-1 max-w-[60ch] text-ink-soft">{t("emptyHint")}</p>
                    </div>
                ) : (
                    <>
                        <ul aria-label={t("results")} className="divide-y divide-line">
                            {visible.map((row) => (
                                <li
                                    key={row.url}
                                    className="grid gap-x-6 gap-y-0.5 px-5 py-3 sm:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1.1fr)] sm:items-baseline sm:px-7"
                                >
                                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-soft sm:order-none sm:text-sm">
                                        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0">
                                            <path
                                                d="M1.75 4.25c0-.69.56-1.25 1.25-1.25h3.1l1.4 1.5H13c.69 0 1.25.56 1.25 1.25v6c0 .69-.56 1.25-1.25 1.25H3c-.69 0-1.25-.56-1.25-1.25z"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="1.3"
                                            />
                                        </svg>
                                        <span className="truncate">{highlight(row.path, terms)}</span>
                                    </span>
                                    <span className="truncate font-medium">{highlight(row.title, terms)}</span>
                                    <span className="truncate font-mono text-xs text-ink-soft sm:text-[0.8rem]">
                                        {highlight(row.url, terms)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        {hidden > 0 && (
                            <p className="border-t border-line px-5 py-3 text-sm text-ink-soft sm:px-7">
                                {t("more", { count: hidden })}
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
