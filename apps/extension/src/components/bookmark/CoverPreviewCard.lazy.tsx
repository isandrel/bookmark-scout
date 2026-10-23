/**
 * The Cover column's larger cover, loaded on first use by `CoverPreviewCard.tsx`: the stored cover
 * at the cover ratio, `cover_preview_max_width_px` wide at most and never wider than the stored
 * image, then the bookmark's title and where the cover came from with the day it was saved, as the
 * preview dialog says it. Everything comes from this device; nothing is fetched.
 *
 * The card never takes focus; the thumbnail names its content with `aria-describedby`
 * (`useHoverCard`). It opens only once the cover and its record are read, so it never grows on
 * screen.
 */
import { ImageIcon } from 'lucide-react';
import type { CSSProperties } from 'react';

type CoverPreviewCardPopupProps = {
  open: boolean;
  /** The thumbnail the card is placed against. */
  anchor: HTMLElement;
  bookmark: HoverCardBookmark;
  contentId: string;
  onCardHover: (over: boolean) => void;
  onDismiss: () => void;
};

const cardStyle = {
  '--hover-card-edge-gap': `${HOVER_CARD_EDGE_GAP_PX}px`,
  // Never wider than the window less its edge gaps; the cover inside shrinks with it.
  maxWidth: 'calc(100vw - var(--hover-card-edge-gap) * 2)',
} as CSSProperties;

const coverRatio = { aspectRatio: String(COVER_ASPECT_RATIO) };

export function CoverPreviewCardPopup({
  open,
  anchor,
  bookmark,
  contentId,
  onCardHover,
  onDismiss,
}: CoverPreviewCardPopupProps) {
  const src = useCoverImage(bookmark.id, bookmark.url);
  const read = useCoverInfo(bookmark.id, bookmark.url);
  // The record read for the thumbnail shown before stays until this one's arrives.
  const info = read?.bookmarkId === bookmark.id ? read : undefined;
  const source = describeCoverSource(info);
  // A cover is never drawn larger than it was stored.
  const width = info ? Math.min(info.width, COVER_PREVIEW_MAX_WIDTH_PX) : 0;

  return (
    <HoverCard
      open={open && Boolean(src && info)}
      onOpenChange={(next) => {
        // Escape and presses outside close it; it opens only through the controller.
        if (!next) onDismiss();
      }}
    >
      <HoverCardContent
        anchor={anchor}
        // Above the thumbnail first, so a pointer moving on down the column never lands on it.
        side="top"
        align="start"
        sideOffset={HOVER_CARD_ROW_GAP_PX}
        collisionPadding={HOVER_CARD_EDGE_GAP_PX}
        data-testid="cover-preview-card"
        style={cardStyle}
        onPointerEnter={() => onCardHover(true)}
        onPointerLeave={() => onCardHover(false)}
      >
        <div id={contentId} className="flex max-w-full flex-col gap-2" style={{ width }}>
          {src ? (
            <img
              src={src}
              alt=""
              decoding="async"
              draggable={false}
              data-testid="cover-preview-image"
              style={coverRatio}
              className="w-full rounded-md border object-cover"
            />
          ) : null}
          <p
            data-testid="cover-preview-title"
            className="line-clamp-2 font-medium leading-snug [overflow-wrap:anywhere]"
          >
            {getBookmarkDisplayTitle(bookmark.title)}
          </p>
          {source ? (
            <p className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
              <ImageIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
              <span className="sr-only">{t('covers_sourceLabel')}</span>
              <span data-testid="cover-preview-source">{source}</span>
            </p>
          ) : null}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
