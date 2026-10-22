/**
 * The bookmark hover card of a list (`useHoverCard`). The card and Base UI's Preview Card load
 * with `BookmarkHoverCard.lazy.tsx` the first time the pointer or keyboard reaches a bookmark
 * (`preloadBookmarkHoverCard`), well within the open delay, so pages that never show one do not
 * load it at startup.
 */
import { createContext, lazy, Suspense } from 'react';

const loadHoverCard = () => import('./BookmarkHoverCard.lazy');

const LazyBookmarkHoverCard = lazy(() =>
  loadHoverCard().then((module) => ({ default: module.BookmarkHoverCardPopup })),
);

/**
 * The page's hover card controller, for cells that open the card themselves (the manager's
 * Summary column); null where the page has none.
 */
export const HoverCardControllerContext = createContext<HoverCardController | null>(null);

/** Starts loading the card, so it is ready by the time the open delay ends. */
export function preloadBookmarkHoverCard(): void {
  void loadHoverCard();
}

type BookmarkHoverCardProps = {
  hoverCard: HoverCardState;
  /** The bookmark a target's id names, as the list knows it; none closes the card. */
  resolve: (id: string) => HoverCardBookmark | undefined;
};

export function BookmarkHoverCard({ hoverCard, resolve }: BookmarkHoverCardProps) {
  const { controller, target, lastTarget, contentId } = hoverCard;
  if (!lastTarget) return null;
  const bookmark = resolve(lastTarget.id);
  if (!bookmark) return null;
  return (
    <Suspense fallback={null}>
      <LazyBookmarkHoverCard
        open={target !== null}
        anchor={lastTarget.anchor}
        bookmark={bookmark}
        contentId={contentId}
        onCardHover={controller.hoverCard}
        onDismiss={controller.dismiss}
      />
    </Suspense>
  );
}
