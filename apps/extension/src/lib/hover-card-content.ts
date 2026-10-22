/**
 * What the bookmark hover card lists (`BookmarkHoverCard.lazy.tsx`). Apart from `hover-card.ts`,
 * which every list with a card loads at start, so this code loads with the card on first use.
 */
import type { StoredBookmarkMetadata } from '@/lib/bookmark-metadata-storage';

export type HoverCardDetails = {
  /** The title as rows show it ("Untitled" when it has none). */
  title: string;
  /** Stored tags without blank ones, in their stored order. */
  tags: readonly string[];
  /** The stored summary, trimmed; empty when there is none. */
  summary: string;
  folderPath: string;
  /** When it was saved; absent when the browser does not say. */
  dateAdded?: number;
};

/**
 * What the card shows. Every bookmark gets a card, even without tags or a summary: its row cuts
 * long titles and addresses short and does not name the folder, which the card always does.
 */
export function getHoverCardDetails(
  bookmark: HoverCardBookmark,
  metadata: StoredBookmarkMetadata | undefined,
): HoverCardDetails {
  return {
    title: getBookmarkDisplayTitle(bookmark.title),
    tags: (metadata?.tags ?? []).filter((tag) => tag.trim()),
    summary: metadata?.summary?.trim() ?? '',
    folderPath: bookmark.folderPath,
    ...(bookmark.dateAdded ? { dateAdded: bookmark.dateAdded } : {}),
  };
}

/**
 * An address shown as three parts, so the site stands out: what comes before the host (the
 * scheme), the host, and the rest. An address without a host is all `rest`.
 */
export function splitUrlAtHost(
  displayUrl: string,
  url: string,
): { before: string; host: string; rest: string } {
  const host = getUrlHostname(url);
  const at = host ? displayUrl.toLowerCase().indexOf(host) : -1;
  if (at < 0) return { before: '', host: '', rest: displayUrl };
  return {
    before: displayUrl.slice(0, at),
    host: displayUrl.slice(at, at + host.length),
    rest: displayUrl.slice(at + host.length),
  };
}
