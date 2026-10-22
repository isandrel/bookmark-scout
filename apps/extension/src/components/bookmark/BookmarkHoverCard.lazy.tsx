/**
 * The bookmark hover card itself, loaded on first use by `BookmarkHoverCard.tsx`: the title, the
 * address with its site in full ink, the folder, the stored tags and whole summary (scrolling past
 * `summary_max_height_px`), a thumbnail of the stored cover, and the date added. Everything comes
 * from this device (the bookmark, `bookmarkMetadata`, and the cover store); nothing is fetched.
 *
 * The card never takes focus, so the search box or row keeps it; the row names the card's content
 * with `aria-describedby` (`useHoverCard`).
 */
import { CalendarPlus, Folder } from 'lucide-react';
import type { CSSProperties } from 'react';

type BookmarkHoverCardPopupProps = {
  open: boolean;
  /** The row or cell the card is placed against. */
  anchor: HTMLElement;
  bookmark: HoverCardBookmark;
  contentId: string;
  onCardHover: (over: boolean) => void;
  onDismiss: () => void;
};

const cardStyle = {
  '--hover-card-max-width': `${HOVER_CARD_MAX_WIDTH_PX}px`,
  '--hover-card-edge-gap': `${HOVER_CARD_EDGE_GAP_PX}px`,
  // As wide as the setting allows, but never wider than the window less its edge gaps.
  width: 'min(var(--hover-card-max-width), calc(100vw - var(--hover-card-edge-gap) * 2))',
} as CSSProperties;

export function BookmarkHoverCardPopup({
  open,
  anchor,
  bookmark,
  contentId,
  onCardHover,
  onDismiss,
}: BookmarkHoverCardPopupProps) {
  return (
    <HoverCard
      open={open}
      onOpenChange={(next) => {
        // Escape and presses outside close it; it opens only through the controller.
        if (!next) onDismiss();
      }}
    >
      <HoverCardContent
        anchor={anchor}
        // Above the row first, so a pointer moving on down the list never lands on the card.
        side="top"
        align="start"
        sideOffset={HOVER_CARD_ROW_GAP_PX}
        collisionPadding={HOVER_CARD_EDGE_GAP_PX}
        data-testid="bookmark-hover-card"
        style={cardStyle}
        onPointerEnter={() => onCardHover(true)}
        onPointerLeave={() => onCardHover(false)}
      >
        <BookmarkHoverCardBody id={contentId} bookmark={bookmark} />
      </HoverCardContent>
    </HoverCard>
  );
}

function BookmarkHoverCardBody({ id, bookmark }: { id: string; bookmark: HoverCardBookmark }) {
  const metadata = useStoredValue(bookmarkMetadataValue, (byId) => byId[bookmark.id]).value;
  const details = getHoverCardDetails(bookmark, metadata);
  const displayUrl = useDisplayUrl();
  const address = splitUrlAtHost(displayUrl(bookmark.url), bookmark.url);

  return (
    <div id={id} className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p
            data-testid="bookmark-hover-card-title"
            className="line-clamp-3 font-medium leading-snug [overflow-wrap:anywhere]"
          >
            {details.title}
          </p>
          <p
            data-testid="bookmark-hover-card-url"
            className="mt-0.5 line-clamp-2 break-all font-mono text-xs text-muted-foreground"
          >
            {address.before}
            <span className="font-medium text-foreground">{address.host}</span>
            {address.rest}
          </p>
        </div>
        {/* Takes room only once a stored cover shows. */}
        <div className="shrink-0 empty:hidden" style={{ width: HOVER_CARD_COVER_WIDTH_PX }}>
          <BookmarkCover bookmarkId={bookmark.id} url={bookmark.url} />
        </div>
      </div>
      {details.tags.length ? (
        <BookmarkTagChips tags={details.tags} max={HOVER_CARD_MAX_TAGS} />
      ) : null}
      {details.summary ? (
        <p
          data-testid="bookmark-hover-card-summary"
          className="overflow-y-auto whitespace-pre-line [overflow-wrap:anywhere]"
          style={{ maxHeight: HOVER_CARD_SUMMARY_MAX_HEIGHT_PX }}
        >
          {details.summary}
        </p>
      ) : null}
      <dl className="flex flex-col gap-1 text-xs text-muted-foreground">
        {details.folderPath ? (
          <div className="flex min-w-0 items-start gap-1.5">
            <dt className="mt-px shrink-0">
              <Folder aria-hidden="true" className="size-3.5" />
              <span className="sr-only">{t('bookmarks_folderPath')}</span>
            </dt>
            <dd
              data-testid="bookmark-hover-card-folder"
              className="min-w-0 [overflow-wrap:anywhere]"
            >
              {details.folderPath}
            </dd>
          </div>
        ) : null}
        {details.dateAdded ? (
          <div className="flex min-w-0 items-start gap-1.5">
            <dt className="mt-px shrink-0">
              <CalendarPlus aria-hidden="true" className="size-3.5" />
              <span className="sr-only">{t('table_columnDateAdded')}</span>
            </dt>
            <dd>{formatDay(details.dateAdded)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
