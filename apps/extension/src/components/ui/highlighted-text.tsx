/**
 * Text with search matches wrapped in `<mark>`, for every search that shows what it matched: the
 * popup and manager trees, folder matches, and the Options settings search. The text is rendered
 * as plain React text, never HTML, because bookmark titles are untrusted.
 *
 * The mark is the `marker` fill with `marker-ink` text and bold weight, so it does not rely on
 * color alone; under forced colors `theme.css` gives it the system `Mark` colors.
 */

import type { ReactNode } from 'react';

type HighlightedTextProps = {
  text: string;
  ranges?: ReadonlyArray<readonly [start: number, end: number]>;
  className?: string;
  /** Show the whole text on hover; off where the row around it has its own tooltip. */
  showTitle?: boolean;
};

export function HighlightedText({
  text,
  ranges,
  className,
  showTitle = true,
}: HighlightedTextProps) {
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const [start, end] of ranges ?? []) {
    if (start < cursor || end <= start) continue;
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={start} className="rounded-sm bg-marker font-semibold text-marker-foreground">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  return (
    <span className={className} title={showTitle ? text : undefined}>
      {parts}
    </span>
  );
}
