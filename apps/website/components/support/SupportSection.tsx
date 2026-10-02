import type { ReactNode } from "react";

/** One support section: heading in the left column on wide screens, content on the right. */
export function SupportSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
    return (
        <section
            id={id}
            aria-labelledby={`${id}-title`}
            className="scroll-mt-24 border-t border-line py-10 first:border-t-0 sm:py-12 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16"
        >
            <h2
                id={`${id}-title`}
                className="mb-6 font-display text-2xl font-semibold tracking-tight sm:text-[1.75rem] lg:mb-0"
            >
                {title}
            </h2>
            <div className="min-w-0">{children}</div>
        </section>
    );
}
