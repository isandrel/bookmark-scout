/**
 * A bookmark's stored cover (Fetch Covers), read from this device only: at the top of its card in
 * the manager and in its preview. Showing it never downloads anything. Without a stored cover for
 * the bookmark's current address, the preview draws nothing, and a card keeps the same room
 * (`CoverFrame`) with its site icon in it, so the card never changes height when a cover loads.
 */
import type { ReactNode } from 'react';

const coverRatio = { aspectRatio: String(COVER_ASPECT_RATIO) };

/**
 * The room a card keeps for a cover, at the cover's ratio: a cover fills it; otherwise `children`
 * (a site or folder icon) sits in its middle on a muted ground, never drawn as a cover.
 */
export function CoverFrame({ cover, children }: { cover?: string; children?: ReactNode }) {
  return (
    <div
      style={coverRatio}
      data-testid="bookmark-card-media"
      data-cover={cover ? 'stored' : 'none'}
      className="relative grid w-full shrink-0 place-items-center overflow-hidden rounded-md border bg-muted text-muted-foreground"
    >
      {cover ? (
        <img
          src={cover}
          alt=""
          decoding="async"
          data-testid="bookmark-cover"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        children
      )}
    </div>
  );
}

type BookmarkCoverProps = {
  bookmarkId: string;
  url: string;
  /** On a card: what the cover's room shows while there is none. Without it, nothing is drawn. */
  fallback?: ReactNode;
};

export function BookmarkCover({ bookmarkId, url, fallback }: BookmarkCoverProps) {
  const src = useCoverImage(bookmarkId, url);

  if (fallback !== undefined) return <CoverFrame cover={src}>{fallback}</CoverFrame>;
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      decoding="async"
      data-testid="bookmark-cover"
      style={coverRatio}
      className="w-full rounded-md border object-cover"
    />
  );
}
