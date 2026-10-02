"use client";

import { useEffect, useState } from "react";

export type TocItem = { id: string; label: string };

/**
 * Anchor links for the table of contents. Marks the section being read with
 * `aria-current="location"`; without JavaScript the links still work, just unmarked.
 */
export function TocLinks({ items }: { items: readonly TocItem[] }) {
    const [activeId, setActiveId] = useState<string | null>(null);

    useEffect(() => {
        const sections = items
            .map((item) => document.getElementById(item.id))
            .filter((section): section is HTMLElement => section !== null);
        if (sections.length === 0) return;

        // A section counts as current once its top passes the upper third of the viewport.
        const observer = new IntersectionObserver(
            () => {
                const threshold = window.innerHeight / 3;
                let current: string | null = null;
                for (const section of sections) {
                    if (section.getBoundingClientRect().top <= threshold) current = section.id;
                }
                setActiveId(current);
            },
            { rootMargin: "0px 0px -66% 0px", threshold: [0, 1] },
        );
        sections.forEach((section) => observer.observe(section));
        return () => observer.disconnect();
    }, [items]);

    return (
        <ol className="space-y-1 text-[0.95rem]">
            {items.map((item) => (
                <li key={item.id}>
                    <a
                        href={`#${item.id}`}
                        aria-current={activeId === item.id ? "location" : undefined}
                        className="-ml-3 block rounded-r-md border-l-2 border-transparent py-1 pl-3 pr-2 text-ink-soft transition-colors hover:border-line hover:text-ink aria-[current=location]:border-teal aria-[current=location]:font-medium aria-[current=location]:text-ink"
                    >
                        {item.label}
                    </a>
                </li>
            ))}
        </ol>
    );
}
