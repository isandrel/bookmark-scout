"use client";

import { useId, useRef, useState } from "react";

export type TabItem = {
    key: string;
    label: React.ReactNode;
    panel: React.ReactNode;
};

const NEXT_INDEX: Record<string, (index: number, count: number) => number> = {
    ArrowRight: (index, count) => (index + 1) % count,
    ArrowLeft: (index, count) => (index - 1 + count) % count,
    Home: () => 0,
    End: (_, count) => count - 1,
};

/** WAI-ARIA tabs with automatic activation and a roving tabindex. Panels are server-rendered. */
export function Tabs({ label, items }: { label: string; items: TabItem[] }) {
    const baseId = useId();
    const [active, setActive] = useState(0);
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const select = (index: number) => {
        setActive(index);
        tabRefs.current[index]?.focus();
    };

    return (
        <div>
            <div
                role="tablist"
                aria-label={label}
                // Narrow screens get an even grid (2x2, or one row of 3) instead of a ragged wrap.
                className={`grid ${items.length % 2 === 0 ? "grid-cols-2" : "grid-cols-3"} gap-1 rounded-2xl border border-line bg-surface p-1 sm:inline-flex sm:max-w-full sm:flex-wrap`}
            >
                {items.map((item, index) => (
                    <button
                        key={item.key}
                        ref={(node) => {
                            tabRefs.current[index] = node;
                        }}
                        type="button"
                        role="tab"
                        id={`${baseId}-tab-${item.key}`}
                        aria-selected={index === active}
                        aria-controls={`${baseId}-panel-${item.key}`}
                        tabIndex={index === active ? 0 : -1}
                        onClick={() => setActive(index)}
                        onKeyDown={(event) => {
                            const next = NEXT_INDEX[event.key];
                            if (!next) return;
                            event.preventDefault();
                            select(next(index, items.length));
                        }}
                        className="rounded-xl px-3 py-2 text-center text-[0.95rem] font-medium sm:px-4 text-ink-soft transition-colors hover:text-ink aria-selected:bg-ink aria-selected:text-paper"
                    >
                        {item.label}
                    </button>
                ))}
            </div>
            {items.map((item, index) => (
                <div
                    key={item.key}
                    role="tabpanel"
                    id={`${baseId}-panel-${item.key}`}
                    aria-labelledby={`${baseId}-tab-${item.key}`}
                    hidden={index !== active}
                    tabIndex={0}
                    className="mt-8 rounded-lg"
                >
                    {item.panel}
                </div>
            ))}
        </div>
    );
}
