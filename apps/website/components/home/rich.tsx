/** Shared rich-text tags for home page messages (`t.rich`). */
export const richTags = {
    code: (chunks: React.ReactNode) => (
        <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[0.88em] [overflow-wrap:anywhere]">{chunks}</code>
    ),
    b: (chunks: React.ReactNode) => <strong className="font-semibold">{chunks}</strong>,
};

export const inlineLinkClass = "font-medium text-teal underline decoration-1 underline-offset-[3px] hover:decoration-2";
