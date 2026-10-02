import type { ReactNode } from "react";

/** One block of long-form copy as stored in the messages files. */
export type ProseBlock =
    | { type: "p"; text: string }
    | { type: "h3"; text: string }
    | { type: "ul"; items: string[] };

/**
 * Renders message blocks. `render` receives the message path of each string (relative to
 * `basePath`'s namespace) so the caller can run it through `t.rich` with its own tags.
 */
export function ProseBlocks({
    blocks,
    basePath,
    render,
}: {
    blocks: readonly ProseBlock[];
    basePath: string;
    render: (path: string) => ReactNode;
}) {
    return (
        <div className="max-w-[68ch] space-y-5 text-[1.0625rem] leading-[1.7] text-ink">
            {blocks.map((block, index) => {
                const path = `${basePath}.${index}`;
                switch (block.type) {
                    case "h3":
                        return (
                            <h3 key={path} className="pt-4 font-display text-xl font-semibold tracking-tight">
                                {render(`${path}.text`)}
                            </h3>
                        );
                    case "ul":
                        return (
                            <ul key={path} className="list-disc space-y-2.5 pl-5 marker:text-teal">
                                {block.items.map((_, itemIndex) => (
                                    <li key={itemIndex} className="pl-1">
                                        {render(`${path}.items.${itemIndex}`)}
                                    </li>
                                ))}
                            </ul>
                        );
                    default:
                        return <p key={path}>{render(`${path}.text`)}</p>;
                }
            })}
        </div>
    );
}
