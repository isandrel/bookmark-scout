export const primaryButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-full bg-teal px-6 py-3 font-semibold text-teal-ink transition-[filter] hover:brightness-110";

export const secondaryButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-full border border-line bg-surface px-6 py-3 font-semibold text-ink transition-colors hover:border-ink";

export function DownloadButton({ href, label }: { href: string; label: string }) {
    return (
        <a href={href} className={primaryButtonClass}>
            <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5">
                <path
                    d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M4 15.5h12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
            {label}
        </a>
    );
}
