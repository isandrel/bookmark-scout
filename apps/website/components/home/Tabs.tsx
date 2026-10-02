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
                className="inline-flex max-w-full flex-wrap gap-1 rounded-2xl border border-line bg-surface p-1"
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
                        className="rounded-xl px-4 py-2 text-[0.95rem] font-medium text-ink-soft transition-colors hover:text-ink aria-selected:bg-ink aria-selected:text-paper"
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
