/**
 * The bookmark hover card itself, loaded on first use by `BookmarkHoverCard.tsx`: the title, the
 * address with its site in full ink, the folder, the stored tags and whole summary (scrolling past
 * `summary_max_height_px`), a thumbnail of the stored cover and where it came from, and the date
 * added, those the user shows in their order (`hoverCardFields`). Everything comes
 * from this device (the bookmark, `bookmarkMetadata`, and the cover store); nothing is fetched.
 *
 * The card never takes focus, so the search box or row keeps it; the row names the card's content
 * with `aria-describedby` (`useHoverCard`).
 */
import { CalendarPlus, Folder, ImageIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

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

/** The details next to the title in the card's first row; the cover sits beside them. */
const HEAD_FIELDS: ReadonlySet<HoverCardField> = new Set(['title', 'address', 'cover']);
/** Short labelled lines, listed together. */
const DETAIL_FIELDS: ReadonlySet<HoverCardField> = new Set(['folder', 'dateAdded']);

type CardBlock =
  /** The first details while they are title, address, or cover: text left, cover right. */
  | { kind: 'head'; fields: HoverCardField[] }
  /** Consecutive folder and date lines; the last list also names the cover's source. */
  | { kind: 'details'; fields: HoverCardField[]; coverSource: boolean }
  | { kind: 'field'; field: HoverCardField };

/**
 * The card's layout for the details the user shows, in their order (`hoverCardFields`). The
 * default order gives the card its usual look: title and address beside the cover, then tags,
 * summary, and the folder and date lines with the cover's source.
 */
function cardBlocks(fields: readonly HoverCardField[]): CardBlock[] {
  const blocks: CardBlock[] = [];
  let index = 0;
  const head: HoverCardField[] = [];
  while (index < fields.length && HEAD_FIELDS.has(fields[index])) head.push(fields[index++]);
  if (head.length > 0) blocks.push({ kind: 'head', fields: head });
  for (const field of fields.slice(index)) {
    const last = blocks.at(-1);
    if (!DETAIL_FIELDS.has(field)) blocks.push({ kind: 'field', field });
    else if (last?.kind === 'details') last.fields.push(field);
    else blocks.push({ kind: 'details', fields: [field], coverSource: false });
  }
  if (fields.includes('cover')) {
    const lists = blocks.filter((block) => block.kind === 'details');
    const list = lists.at(-1);
    if (list) list.coverSource = true;
    else blocks.push({ kind: 'details', fields: [], coverSource: true });
  }
  return blocks;
}

function BookmarkHoverCardBody({ id, bookmark }: { id: string; bookmark: HoverCardBookmark }) {
  const metadata = useStoredValue(bookmarkMetadataValue, (byId) => byId[bookmark.id]).value;
  const details = getHoverCardDetails(bookmark, metadata);
  const displayUrl = useDisplayUrl();
  const address = splitUrlAtHost(displayUrl(bookmark.url), bookmark.url);
  const coverSource = useCoverSourceText(bookmark.id, bookmark.url);
  const { value: storedFields } = useSetting('hoverCardFields');
  const blocks = cardBlocks(getHoverCardFields(storedFields));

  const title = (
    <p
      key="title"
      data-testid="bookmark-hover-card-title"
      className="line-clamp-3 font-medium leading-snug [overflow-wrap:anywhere] not-first:mt-0.5"
    >
      {details.title}
    </p>
  );
  const url = (
    <p
      key="address"
      data-testid="bookmark-hover-card-url"
      className="line-clamp-2 break-all font-mono text-xs text-muted-foreground not-first:mt-0.5"
    >
      {address.before}
      <span className="font-medium text-foreground">{address.host}</span>
      {address.rest}
    </p>
  );
  // Takes room only once a stored cover shows.
  const cover = (
    <div
      key="cover"
      data-testid="bookmark-hover-card-cover"
      className="shrink-0 empty:hidden"
      style={{ width: HOVER_CARD_COVER_WIDTH_PX }}
    >
      <BookmarkCover bookmarkId={bookmark.id} url={bookmark.url} />
    </div>
  );
  const tags = details.tags.length ? (
    <BookmarkTagChips key="tags" tags={details.tags} max={HOVER_CARD_MAX_TAGS} />
  ) : null;
  const summary = details.summary ? (
    <p
      key="summary"
      data-testid="bookmark-hover-card-summary"
      className="overflow-y-auto whitespace-pre-line [overflow-wrap:anywhere]"
      style={{ maxHeight: HOVER_CARD_SUMMARY_MAX_HEIGHT_PX }}
    >
      {details.summary}
    </p>
  ) : null;
  const folderLine = details.folderPath ? (
    <div key="folder" className="flex min-w-0 items-start gap-1.5">
      <dt className="mt-px shrink-0">
        <Folder aria-hidden="true" className="size-3.5" />
        <span className="sr-only">{t('bookmarks_folderPath')}</span>
      </dt>
      <dd data-testid="bookmark-hover-card-folder" className="min-w-0 [overflow-wrap:anywhere]">
        {details.folderPath}
      </dd>
    </div>
  ) : null;
  const dateLine = details.dateAdded ? (
    <div key="dateAdded" className="flex min-w-0 items-start gap-1.5">
      <dt className="mt-px shrink-0">
        <CalendarPlus aria-hidden="true" className="size-3.5" />
        <span className="sr-only">{t('table_columnDateAdded')}</span>
      </dt>
      <dd data-testid="bookmark-hover-card-date">{formatDay(details.dateAdded)}</dd>
    </div>
  ) : null;
  const coverSourceLine = coverSource ? (
    <div key="coverSource" className="flex min-w-0 items-start gap-1.5">
      <dt className="mt-px shrink-0">
        <ImageIcon aria-hidden="true" className="size-3.5" />
        <span className="sr-only">{t('covers_sourceLabel')}</span>
      </dt>
      <dd data-testid="bookmark-hover-card-cover-source">{coverSource}</dd>
    </div>
  ) : null;
  const parts: Record<HoverCardField, ReactNode> = {
    title,
    address: url,
    cover,
    tags,
    summary,
    folder: folderLine,
    dateAdded: dateLine,
  };

  return (
    <div id={id} className="flex flex-col gap-2">
      {blocks.map((block) => {
        if (block.kind === 'head') {
          const text = block.fields.filter((field) => field !== 'cover');
          return (
            <div key="head" className="flex items-start gap-3">
              {text.length > 0 ? (
                <div className="min-w-0 flex-1">{text.map((field) => parts[field])}</div>
              ) : null}
              {block.fields.includes('cover') ? cover : null}
            </div>
          );
        }
        if (block.kind === 'field') return parts[block.field];
        const lines = [
          ...block.fields.map((field) => parts[field]),
          block.coverSource ? coverSourceLine : null,
        ];
        if (!lines.some(Boolean)) return null;
        return (
          <dl
            key={`details-${block.fields.join()}`}
            className="flex flex-col gap-1 text-xs text-muted-foreground"
          >
            {lines}
          </dl>
        );
      })}
    </div>
  );
}
