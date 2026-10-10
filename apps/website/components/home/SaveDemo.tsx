"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
    DEMO_FOLDER_TREE,
    DEMO_PAGE_URL,
    DEMO_SETTINGS,
    type DemoFolderNode,
} from "@/lib/content/demo-folders";
import { type DemoFolder, findDemoFolderMatches } from "@/lib/folder-match";

type Status = { kind: "saved" | "already"; folderId: string } | null;

function flatten(nodes: readonly DemoFolderNode[], name: (key: string) => string, parents: string[] = []): DemoFolder[] {
    return nodes.flatMap((node) => {
        const folder = { id: node.key, name: name(node.key), parents };
        return [folder, ...flatten(node.children ?? [], name, [...parents, folder.name])];
    });
}

function FolderIcon() {
    return (
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 shrink-0 text-ink-soft">
            <path
                d="M1.75 4.25c0-.69.56-1.25 1.25-1.25h3.1l1.4 1.5H13c.69 0 1.25.56 1.25 1.25v6c0 .69-.56 1.25-1.25 1.25H3c-.69 0-1.25-.56-1.25-1.25z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
            />
        </svg>
    );
}

/**
 * The hero demo: save the current page by typing part of a folder's name, as in the extension's
 * popup. Nothing is stored; a reload starts over.
 */
export function SaveDemo() {
    const t = useTranslations("home.demo");
    const inputId = useId();
    const listId = useId();
    const chips = t.raw("chips") as string[];
    const autoQuery = t("autoQuery");

    const [query, setQuery] = useState("");
    const [autoTyping, setAutoTyping] = useState(false);
    const [active, setActive] = useState(0);
    const [savedIn, setSavedIn] = useState<readonly string[]>([]);
    const [recentIds, setRecentIds] = useState<readonly string[]>([]);
    const [status, setStatus] = useState<Status>(null);
    const touched = useRef(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const folders = useMemo(() => flatten(DEMO_FOLDER_TREE, (key) => t(`folders.${key}`)), [t]);
    const matches = useMemo(
        () => findDemoFolderMatches(folders, query, { limit: DEMO_SETTINGS.maxMatches, recentIds }),
        [folders, query, recentIds],
    );
    const pathOf = (folder: DemoFolder) => [...folder.parents, folder.name].join(" / ");

    // The page's one orchestrated motion: type a folder name once, unless the visitor acts first.
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

    const changeQuery = (next: string) => {
        setQuery(next);
        setActive(0);
        setStatus(null);
    };

    const save = (folder: DemoFolder) => {
        takeOver();
        if (savedIn.includes(folder.id)) {
            setStatus({ kind: "already", folderId: folder.id });
            return;
        }
        setSavedIn((current) => [...current, folder.id]);
        setRecentIds((current) => [folder.id, ...current.filter((id) => id !== folder.id)]);
        setStatus({ kind: "saved", folderId: folder.id });
    };

    const activeIndex = Math.min(active, Math.max(matches.length - 1, 0));
    const statusFolder = status && folders.find((folder) => folder.id === status.folderId);

    return (
        <div className="relative overflow-hidden rounded-[1.25rem] border border-line bg-surface shadow-[0_30px_60px_-30px_rgb(15_33_53/0.35)]">
            <span aria-hidden="true" className="ribbon absolute left-5 top-0 h-12 w-7 sm:left-7 sm:h-14 sm:w-8" />

            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4 pl-16 pr-5 sm:pl-20 sm:pr-7">
                <label htmlFor={inputId} className="text-sm font-medium text-ink-soft">
                    {t("label")}
                </label>
                <p className="min-w-0 truncate text-sm text-ink-soft">
                    <span className="sr-only">{t("pageLabel")}: </span>
                    <span className="font-medium text-ink">{t("pageTitle")}</span>
                    <span className="ml-2 font-mono text-xs">{DEMO_PAGE_URL}</span>
                </p>
            </div>

            <div className="px-5 sm:px-7">
                <div className="flex items-center gap-3 border-b-2 border-line transition-colors focus-within:border-teal">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 shrink-0 text-ink-soft sm:size-8">
                        <path
                            d="M2.5 6.5c0-1 .8-1.8 1.8-1.8h4.5l2 2.2h8.9c1 0 1.8.8 1.8 1.8v8.8c0 1-.8 1.8-1.8 1.8H4.3c-1 0-1.8-.8-1.8-1.8z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                        />
                    </svg>
                    <div className="relative min-w-0 flex-1">
                        <input
                            ref={inputRef}
                            id={inputId}
                            type="text"
                            role="combobox"
                            aria-expanded={matches.length > 0}
                            aria-controls={listId}
                            aria-autocomplete="list"
                            aria-activedescendant={matches.length > 0 ? `${listId}-${activeIndex}` : undefined}
                            value={query}
                            onChange={(event) => {
                                takeOver();
                                changeQuery(event.target.value);
                            }}
                            onFocus={takeOver}
                            onKeyDown={(event) => {
                                if (matches.length === 0) return;
                                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                                    event.preventDefault();
                                    takeOver();
                                    const step = event.key === "ArrowDown" ? 1 : -1;
                                    setActive((activeIndex + step + matches.length) % matches.length);
                                } else if (event.key === "Enter") {
                                    event.preventDefault();
                                    save(matches[activeIndex].folder);
                                }
                            }}
                            placeholder={t("placeholder")}
                            autoComplete="off"
                            spellCheck={false}
                            // The teal underline marks focus; the site-wide outline would box the large text.
                            style={{ outline: "none" }}
                            className="w-full bg-transparent py-2 font-display text-[1.625rem] font-semibold tracking-tight text-ink placeholder:text-ink-soft/70 focus-visible:outline-none sm:text-[2.5rem]"
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
                                changeQuery("");
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
                                changeQuery(chip);
                            }}
                            className="rounded-full border border-line px-3 py-1 font-mono text-sm text-ink-soft transition-colors hover:border-teal hover:text-ink aria-pressed:border-teal aria-pressed:bg-teal aria-pressed:text-teal-ink"
                        >
                            {chip}
                        </button>
                    ))}
                </div>
            </div>

            <div className="min-h-[15rem] border-t border-line">
                {query.trim() === "" ? (
                    <p className="px-5 py-8 text-ink-soft sm:px-7">{t("startHint")}</p>
                ) : matches.length === 0 ? (
                    <div className="px-5 py-8 sm:px-7">
                        <p className="font-medium">{t("emptyTitle", { query: query.trim() })}</p>
                        <p className="mt-1 max-w-[60ch] text-ink-soft">{t("emptyHint")}</p>
                    </div>
                ) : (
                    <>
                        <p className="px-5 pt-4 text-xs font-semibold uppercase tracking-wider text-ink-soft sm:px-7">
                            {t("matches")}
                        </p>
                        <ul id={listId} role="listbox" aria-label={t("matches")} className="px-2 py-2 sm:px-4">
                            {matches.map((match, index) => {
                                const { folder, range } = match;
                                const isActive = index === activeIndex;
                                const isSaved = savedIn.includes(folder.id);
                                return (
                                    <li
                                        key={folder.id}
                                        id={`${listId}-${index}`}
                                        role="option"
                                        aria-selected={isActive}
                                        onMouseEnter={() => setActive(index)}
                                        onClick={() => save(folder)}
                                        className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 aria-selected:bg-sunken"
                                    >
                                        <FolderIcon />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-medium">
                                                {range ? (
                                                    <>
                                                        {folder.name.slice(0, range[0])}
                                                        <mark>{folder.name.slice(range[0], range[1])}</mark>
                                                        {folder.name.slice(range[1])}
                                                    </>
                                                ) : (
                                                    folder.name
                                                )}
                                            </span>
                                            {folder.parents.length > 0 && (
                                                <span className="block truncate text-xs text-ink-soft">
                                                    {folder.parents.join(" / ")}
                                                </span>
                                            )}
                                        </span>
                                        {isSaved ? (
                                            <span className="shrink-0 text-xs font-medium text-teal">{t("savedBadge")}</span>
                                        ) : (
                                            <span
                                                aria-hidden="true"
                                                className={`shrink-0 rounded-full border border-line px-2.5 py-0.5 text-xs font-medium ${isActive ? "border-teal text-ink" : "text-ink-soft"}`}
                                            >
                                                {t("saveHere")}
                                            </span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-line px-5 py-3 text-sm sm:px-7">
                <p aria-live="polite" className="min-h-[1.25rem] font-medium">
                    {status &&
                        statusFolder &&
                        t(status.kind === "saved" ? "saved" : "alreadySaved", { folder: pathOf(statusFolder) })}
                </p>
                <p className="text-ink-soft">{t("keys")}</p>
            </div>
        </div>
    );
}
