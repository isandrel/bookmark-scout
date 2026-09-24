/**
 * HighlightedText component.
 * Renders untrusted text as plain React text, wrapping search matches in `<mark>` elements.
 */

import type { ReactNode } from 'react';

interface HighlightedTextProps {
  text: string;
  ranges?: ReadonlyArray<readonly [start: number, end: number]>;
  className?: string;
}

export function HighlightedText({ text, ranges, className }: HighlightedTextProps) {
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const [start, end] of ranges ?? []) {
    if (start < cursor || end <= start) continue;
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark
        key={start}
        className="rounded-sm bg-yellow-200/70 font-semibold text-inherit dark:bg-yellow-500/30"
      >
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  return (
    <span className={className} title={text}>
      {parts}
    </span>
  );
}
