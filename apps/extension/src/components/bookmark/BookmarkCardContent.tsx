/**
 * What a card of the manager's cards view (Manager View on Cards) shows besides the cells it shares
 * with the list's row, as Options > Behavior > Cards arranges it (`managerCardFields`): the room
 * for a cover, the folder path, a bookmark's tags and summary, and at the end a folder's item
 * count. Everything comes from this device; nothing is fetched.
 *
 * The room for a cover keeps its size whether or not a cover is stored, so a card never changes
 * height when one loads. Without a cover a bookmark's room shows a placeholder tile drawn from its
 * address (`lib/cover-placeholder.ts`): the site icon (the first letter when there is none) and the
 * site's name on a tone of the site's own color, small and centered, so a shared site icon never
 * passes for a page's own cover. A folder's shows the folder icon. Separators have no room for one.
 */
import { Folder, Link } from 'lucide-react';
import type { CSSProperties } from 'react';

const placeholderIconClass = 'shrink-0';
const iconSize = { width: CARD_PLACEHOLDER_ICON_PX, height: CARD_PLACEHOLDER_ICON_PX };

/** The first letter of the bookmark's site (or title), for a site with no icon. */
function siteInitial(item: Bookmark): string {
  const source = withoutWww(getUrlHostname(item.url)) || item.title.trim();
  return Array.from(source)[0]?.toLocaleUpperCase() ?? '';
}

/** The top of a card: the stored cover's room, holding the site or folder icon until one shows. */
export function BookmarkCardMedia({ item }: { item: Bookmark }) {
  if (item.type === ItemTypeEnum.Folder) {
    return (
      <CoverFrame>
        <Folder aria-hidden="true" style={iconSize} className={placeholderIconClass} />
      </CoverFrame>
    );
  }
  if (item.type !== ItemTypeEnum.Link) return null;
  if (!item.url) {
    return (
      <CoverFrame>
        <Link aria-hidden="true" style={iconSize} className={placeholderIconClass} />
      </CoverFrame>
    );
  }
  return (
    <BookmarkCover
      bookmarkId={item.id}
      url={item.url}
      fallback={<CoverPlaceholder item={item} url={item.url} />}
    />
  );
}

/**
 * A bookmark's room while it has no cover: its site icon and name on a tone of the site's color.
 * Decorative: the card names the bookmark and its address already.
 */
function CoverPlaceholder({ item, url }: { item: Bookmark; url: string }) {
  const site = coverPlaceholderSite(url);
  const hue = coverPlaceholderHue(url);
  return (
    <div
      aria-hidden="true"
      data-testid="bookmark-card-placeholder"
      data-hue={hue}
      style={{ '--cover-tile-hue': hue } as CSSProperties}
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-cover-tile px-3 text-foreground"
    >
      <SiteIcon
        url={url}
        size={CARD_PLACEHOLDER_ICON_PX}
        className="rounded-sm"
        fallback={
          <span
            data-testid="bookmark-card-initial"
            style={{ ...iconSize, fontSize: CARD_PLACEHOLDER_ICON_PX / 2 }}
            className="grid place-items-center rounded-full border bg-card font-medium"
          >
            {siteInitial(item)}
          </span>
        }
      />
      {site ? (
        <span
          data-testid="bookmark-card-site"
          className="max-w-full truncate font-mono text-xs font-medium"
        >
          {site}
        </span>
      ) : null}
    </div>
  );
}

/** How a card draws its tags and summary (Options > Behavior > Cards). */
export type BookmarkCardLimits = {
  /** Tag chips before a "+N" chip for the rest. */
  maxTags: number;
  /** Lines of the summary shown. */
  summaryLines: number;
};

type BookmarkCardFieldProps = {
  item: Bookmark;
  field: ManagerCardField;
  limits: BookmarkCardLimits;
};

/**
 * One field of a card (`managerCardFields`): the cover's room, the folder path, or a bookmark's
 * stored tags or summary. The address is the row's own cell, which the table draws.
 */
export function BookmarkCardField({ item, field, limits }: BookmarkCardFieldProps) {
  const metadata = useStoredValue(bookmarkMetadataValue, (byId) => byId[item.id]).value;
  switch (field) {
    case 'cover':
      return <BookmarkCardMedia item={item} />;
    case 'folder':
      return item.folderPath ? (
        <p data-testid="bookmark-card-folder" className="flex min-w-0 items-center gap-1">
          <Folder aria-hidden="true" className="size-3 shrink-0" />
          <span className="truncate">{item.folderPath}</span>
        </p>
      ) : null;
    case 'tags': {
      const tags = item.type === ItemTypeEnum.Link ? (metadata?.tags ?? []) : [];
      return tags.length ? <BookmarkTagChips tags={tags} max={limits.maxTags} /> : null;
    }
    case 'summary': {
      const summary = item.type === ItemTypeEnum.Link ? (metadata?.summary?.trim() ?? '') : '';
      return summary ? (
        // Cut to a few lines on screen; the whole summary stays in the page for screen readers.
        <p
          data-testid="bookmark-card-summary"
          style={{ '--card-summary-lines': limits.summaryLines } as CSSProperties}
          className="line-clamp-(--card-summary-lines) break-words text-foreground"
          title={summary}
        >
          {summary}
        </p>
      ) : null;
    }
    case 'url':
      return null;
  }
}

/** At the end of a folder's card: how many items the folder holds directly. */
export function BookmarkCardDetails({
  item,
  folderItemCount,
}: {
  item: Bookmark;
  /** How many items the folder holds directly. */
  folderItemCount: number;
}) {
  if (item.type !== ItemTypeEnum.Folder) return null;
  return (
    <p data-testid="bookmark-card-count" className="truncate">
      {tPlural('bookmarks_cardFolderItems', folderItemCount)}
    </p>
  );
}
