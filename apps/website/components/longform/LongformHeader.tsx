import type { ReactNode } from "react";

/**
 * Title block for long-form pages (privacy, support): the brand ribbon beside the title,
 * an optional meta line such as the effective date, and the intro.
 */
export function LongformHeader({
    title,
    meta,
    intro,
    note,
}: {
    title: string;
    meta?: ReactNode;
    intro: ReactNode;
    note?: ReactNode;
}) {
    return (
        <header className="border-b border-line pb-10 pt-12 sm:pt-20">
            <div className="flex items-start gap-4 sm:gap-5">
                <span aria-hidden="true" className="ribbon mt-1.5 h-11 w-7 shrink-0 sm:mt-2 sm:h-14 sm:w-9" />
                <div className="min-w-0">
                    <h1 className="font-display text-3xl font-bold tracking-tight text-balance min-[400px]:text-4xl sm:text-5xl lg:text-6xl">
                        {title}
                    </h1>
                    {meta ? <p className="mt-3 text-ink-soft">{meta}</p> : null}
                </div>
            </div>
            <div className="mt-8 max-w-[62ch] space-y-3">
                <p className="text-lg leading-relaxed sm:text-xl">{intro}</p>
                {note ? <p className="text-sm leading-relaxed text-ink-soft">{note}</p> : null}
            </div>
        </header>
    );
}
