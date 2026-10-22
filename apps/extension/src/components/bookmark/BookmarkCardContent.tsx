/**
 * What a card of the manager's cards view (Manager View on Cards) shows besides the cells it shares
 * with the list's row: the room for a cover at the top, and under the address a folder's item
 * count or a bookmark's tags and summary. Everything comes from this device; nothing is fetched.
 *
 * The room for a cover keeps its size whether or not a cover is stored, so a card never changes
 * height when one loads. Without a cover it shows the site icon (the bookmark's first letter when
 * there is none) or the folder icon, small and centered, so a shared site icon never passes for a
 * page's own cover. Separators have no room for one.
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
  const initial = siteInitial(item);
  return (
    <BookmarkCover
      bookmarkId={item.id}
      url={item.url}
      fallback={
        <SiteIcon
          url={item.url}
          size={CARD_PLACEHOLDER_ICON_PX}
          className="rounded-sm"
          fallback={
            <span
              aria-hidden="true"
              data-testid="bookmark-card-initial"
              style={{ ...iconSize, fontSize: CARD_PLACEHOLDER_ICON_PX / 2 }}
              className="grid place-items-center rounded-full border bg-card font-medium"
            >
              {initial}
            </span>
          }
        />
      }
    />
  );
}

type BookmarkCardDetailsProps = {
  item: Bookmark;
  /** For a folder card: how many items the folder holds directly. */
  folderItemCount: number;
};

/** Under a card's address: the folder's item count, or the bookmark's stored tags and summary. */
export function BookmarkCardDetails({ item, folderItemCount }: BookmarkCardDetailsProps) {
  const metadata = useStoredValue(bookmarkMetadataValue, (byId) => byId[item.id]).value;
  if (item.type === ItemTypeEnum.Folder) {
    return (
      <p data-testid="bookmark-card-count" className="truncate">
        {tPlural('bookmarks_cardFolderItems', folderItemCount)}
      </p>
    );
  }
  if (item.type !== ItemTypeEnum.Link) return null;
  const tags = metadata?.tags ?? [];
  const summary = metadata?.summary?.trim() ?? '';
  if (!tags.length && !summary) return null;
  return (
    <>
      {tags.length ? <BookmarkTagChips tags={tags} max={CARD_MAX_TAGS} /> : null}
      {summary ? (
        // Cut to a few lines on screen; the whole summary stays in the page for screen readers.
        <p
          data-testid="bookmark-card-summary"
          style={{ '--card-summary-lines': CARD_SUMMARY_LINES } as CSSProperties}
          className="line-clamp-(--card-summary-lines) break-words text-foreground"
          title={summary}
        >
          {summary}
        </p>
      ) : null}
    </>
  );
}
