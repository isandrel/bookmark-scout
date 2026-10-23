/**
 * The manager list's Cover column (`columns.tsx`): a bookmark's stored cover as a thumbnail at the
 * cover ratio, `cover_thumbnail_height_px` tall so its row keeps its height. A row without a stored
 * cover shows nothing, and nothing is ever fetched. The image is read only for the rows of the page
 * shown, and its object URL is revoked when the row goes (`useCoverImage`).
 *
 * Resting the pointer on the thumbnail, or keyboard focus on it, shows the cover larger in the
 * page's cover preview card (`preview`, which `CoverPreviewCard` draws); a click opens the
 * bookmark's preview.
 */
import type { CSSProperties, FocusEvent, PointerEvent } from 'react';

const thumbnailStyle: CSSProperties = {
  width: COVER_THUMBNAIL_SIZE_PX.width,
  height: COVER_THUMBNAIL_SIZE_PX.height,
};

type BookmarkCoverCellProps = {
  item: Bookmark;
  host: ActionItemHost;
  /** The page's cover preview card; without one, the thumbnail only opens the preview. */
  preview?: HoverCardController;
};

export function BookmarkCoverCell({ item, host, preview }: BookmarkCoverCellProps) {
  const src = useCoverImage(item.id, item.url);
  if (!src) return null;

  const targetFor = (element: HTMLElement): HoverCardTarget => ({
    id: item.id,
    anchor: element,
    described: element,
  });

  return (
    <button
      type="button"
      data-testid="bookmark-cover-thumbnail"
      aria-label={t('table_coverOf', getBookmarkDisplayTitle(item.title.trim()))}
      aria-haspopup="dialog"
      style={thumbnailStyle}
      className="block overflow-hidden rounded-sm border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onPointerEnter={(event: PointerEvent<HTMLButtonElement>) => {
        if (!preview || event.pointerType === 'touch') return;
        preloadCoverPreviewCard();
        preview.hover(targetFor(event.currentTarget));
      }}
      onPointerLeave={() => preview?.hover(null)}
      onFocus={(event: FocusEvent<HTMLButtonElement>) => {
        if (!preview) return;
        // Keyboard focus shows the larger cover, as resting the pointer does; a click does not.
        const keyboard = event.currentTarget.matches(':focus-visible');
        if (keyboard) preloadCoverPreviewCard();
        preview.focus(keyboard ? targetFor(event.currentTarget) : null);
      }}
      onBlur={() => preview?.focus(null)}
      onClick={() => {
        preview?.dismiss();
        host.preview(item);
      }}
    >
      <img
        src={src}
        alt=""
        // Decoded off the main thread as the page opens, not while it scrolls: loading lazily
        // put the decoding in the scroll (28 long frames against 21 without covers, tests/perf at
        // 4x CPU throttle, 2026-10-22), loading at once kept it level (23). A page holds at most
        // the largest of `page_sizes` rows.
        decoding="async"
        // Dragging the thumbnail drags its row, as from any other cell.
        draggable={false}
        className="size-full object-cover"
      />
    </button>
  );
}
