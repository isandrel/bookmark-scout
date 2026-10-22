/**
 * The manager list's Tags and Summary columns (`columns.tsx`): a bookmark's stored tags and
 * summary, read from this device's `bookmarkMetadata`. A summary is cut to `summary_column_lines`
 * lines; one cut short shows whole in the page's hover card (`HoverCardControllerContext`) when the
 * pointer rests on it or keyboard focus reaches its row.
 */
import { type CSSProperties, type PointerEvent, useContext, useEffect, useRef } from 'react';

/** A grid row of the manager table, which takes focus as a whole. */
const ROW_SELECTOR = '[data-row-id]';

/** Whether the text in `element` is cut short by its line clamp. */
function isCutShort(element: HTMLElement): boolean {
  return element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth;
}

export function BookmarkTagsCell({ item }: { item: Bookmark }) {
  const tags = useStoredValue(bookmarkMetadataValue, (byId) => byId[item.id]?.tags).value;
  if (!tags?.length) return null;
  return <BookmarkTagChips tags={tags} max={COLUMN_MAX_TAGS} wrap={false} />;
}

const summaryLines = { '--summary-lines': SUMMARY_COLUMN_LINES } as CSSProperties;

export function BookmarkSummaryCell({ item }: { item: Bookmark }) {
  const summary =
    useStoredValue(bookmarkMetadataValue, (byId) => byId[item.id]?.summary).value?.trim() ?? '';
  const hoverCard = useContext(HoverCardControllerContext);
  const textRef = useRef<HTMLParagraphElement>(null);

  const targetFor = (text: HTMLElement): HoverCardTarget | null => {
    const row = text.closest<HTMLElement>(ROW_SELECTOR);
    return row && isCutShort(text) ? { id: item.id, anchor: text, described: row } : null;
  };

  // Keyboard focus on the row shows a summary cut short, as resting the pointer on it does.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `targetFor` reads only `item.id`; `summary` re-runs it once the text is drawn.
  useEffect(() => {
    const text = textRef.current;
    const row = text?.closest<HTMLElement>(ROW_SELECTOR);
    if (!hoverCard || !text || !row) return;
    const onFocus = () => {
      const target = row.matches(':focus-visible') ? targetFor(text) : null;
      if (target) preloadBookmarkHoverCard();
      hoverCard.focus(target);
    };
    const onBlur = () => hoverCard.focus(null);
    row.addEventListener('focus', onFocus);
    row.addEventListener('blur', onBlur);
    return () => {
      row.removeEventListener('focus', onFocus);
      row.removeEventListener('blur', onBlur);
    };
  }, [hoverCard, item.id, summary]);

  if (!summary) return null;
  return (
    <p
      ref={textRef}
      data-testid="bookmark-summary-cell"
      style={summaryLines}
      className="line-clamp-(--summary-lines) whitespace-normal text-xs leading-snug [overflow-wrap:anywhere]"
      // Without a hover card on the page, the browser's tooltip still shows the whole text.
      title={hoverCard ? undefined : summary}
      onPointerEnter={(event: PointerEvent<HTMLParagraphElement>) => {
        if (!hoverCard || event.pointerType === 'touch') return;
        const target = targetFor(event.currentTarget);
        if (target) preloadBookmarkHoverCard();
        hoverCard.hover(target);
      }}
      onPointerLeave={() => hoverCard?.hover(null)}
    >
      {summary}
    </p>
  );
}
