"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, type KeyboardEvent, useId, useMemo, useState } from "react";
import { getCopy } from "@/lib/copy";
import type { DocEntry } from "@/lib/doc-index";

type TaskFinderProps = {
  /** The page language, which picks the finder copy. */
  locale: string;
  entries: DocEntry[];
  /** Sections listed, by title, before anything is typed. Typing searches every page. */
  featuredSections: string[];
  /** Example queries offered as one-click filters. */
  suggestions: string[];
};

function tokenize(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  if (tokens.length === 0) return text;
  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);
  return parts.map((part, index) => {
    const key = `${index}-${part}`;
    return index % 2 === 1 ? (
      <mark key={key}>{part}</mark>
    ) : (
      <Fragment key={key}>{part}</Fragment>
    );
  });
}

/**
 * The docs home's page finder: a filterable list of pages styled like a bookmark
 * search, so the first thing on the page is the product's own core action.
 */
export function TaskFinder({
  locale,
  entries,
  featuredSections,
  suggestions,
}: TaskFinderProps) {
  const copy = getCopy(locale);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const inputId = useId();
  const listId = useId();
  const statusId = useId();

  const tokens = useMemo(() => tokenize(query), [query]);
  const results = useMemo(() => {
    if (tokens.length === 0) {
      return entries.filter((entry) =>
        featuredSections.includes(entry.section),
      );
    }
    return entries.filter((entry) => {
      const haystack =
        `${entry.title} ${entry.description} ${entry.section}`.toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [entries, featuredSections, tokens]);

  const groups = useMemo(
    () =>
      featuredSections.map(
        (section) =>
          [
            section,
            entries.filter((entry) => entry.section === section),
          ] as const,
      ),
    [entries, featuredSections],
  );

  const status =
    tokens.length === 0
      ? copy.finder.idle(entries.length)
      : copy.finder.count(results.length, entries.length);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && results[0]) {
      event.preventDefault();
      router.push(results[0].url);
    }
    if (event.key === "Escape" && query) {
      event.preventDefault();
      setQuery("");
    }
  };

  return (
    <section
      aria-label={copy.finder.region}
      className="relative mt-8 rounded-2xl border border-fd-border bg-fd-card"
    >
      <span
        aria-hidden
        className="bs-ribbon absolute -top-px left-6 h-10 w-5 sm:left-8"
      />

      <div className="border-b border-fd-border px-5 pt-7 pb-4 sm:px-8">
        <div className="flex items-center gap-3">
          <label htmlFor={inputId} className="sr-only">
            {copy.finder.label}
          </label>
          <Search
            aria-hidden
            className="size-6 shrink-0 text-fd-primary"
            strokeWidth={2.25}
          />
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={copy.finder.placeholder}
            autoComplete="off"
            spellCheck={false}
            aria-controls={listId}
            aria-describedby={statusId}
            className="min-w-0 flex-1 bg-transparent font-display text-[1.5rem] font-semibold tracking-tight text-fd-foreground outline-none placeholder:text-fd-muted-foreground/70 sm:text-[1.875rem]"
          />
        </div>
        <p
          id={statusId}
          aria-live="polite"
          className="mt-1 text-sm tabular-nums text-fd-muted-foreground"
        >
          {status}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 px-5 pt-4 sm:px-8">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => setQuery(suggestion)}
            aria-pressed={query === suggestion}
            className="rounded-full border border-fd-border px-3 py-1 text-sm text-fd-muted-foreground transition-colors hover:border-fd-primary hover:text-fd-foreground aria-pressed:border-fd-primary aria-pressed:bg-fd-accent aria-pressed:text-fd-foreground"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <div id={listId} className="px-2 pt-2 pb-3 sm:px-4">
        {tokens.length === 0 ? (
          groups.map(([section, sectionEntries]) => (
            <div key={section} className="px-3 pt-3 sm:px-4">
              <h2 className="mb-1 font-display text-sm font-bold text-fd-foreground">
                {section}
              </h2>
              <ul className="-mx-2 grid gap-x-4 sm:grid-cols-2">
                {sectionEntries.map((entry) => (
                  <li key={entry.url}>
                    <Link
                      href={entry.url}
                      className="block rounded-lg px-2 py-1.5 text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
                    >
                      {entry.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : results.length > 0 ? (
          <ul>
            {results.map((entry) => (
              <li key={entry.url}>
                <Link
                  href={entry.url}
                  className="block rounded-xl px-3 py-3 transition-colors hover:bg-fd-accent sm:px-4"
                >
                  <span className="block text-sm text-fd-muted-foreground">
                    {entry.section}
                  </span>
                  <span className="block font-display text-[1.0625rem] font-semibold text-fd-foreground">
                    <Highlight text={entry.title} tokens={tokens} />
                  </span>
                  <span className="block text-sm leading-relaxed text-fd-muted-foreground">
                    <Highlight text={entry.description} tokens={tokens} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-4 text-fd-muted-foreground sm:px-4">
            {copy.finder.noMatch(query.trim())}
          </p>
        )}
      </div>
    </section>
  );
}
