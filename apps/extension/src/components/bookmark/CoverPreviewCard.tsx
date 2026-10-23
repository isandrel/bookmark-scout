/**
 * The larger cover of the manager list's Cover column: one card for the whole table, opened and
 * closed like the bookmark hover card (`useHoverCard`): after the pointer rests on a thumbnail, or
 * keyboard focus stays on it, for the open delay; Escape closes it; it never takes focus. The card
 * and Base UI's Preview Card load with `CoverPreviewCard.lazy.tsx` the first time the pointer or
 * keyboard reaches a thumbnail (`preloadCoverPreviewCard`), so the manager's startup code does not
 * grow.
 */
import { lazy, Suspense } from 'react';

const loadCoverPreview = () => import('./CoverPreviewCard.lazy');

const LazyCoverPreviewCard = lazy(() =>
  loadCoverPreview().then((module) => ({ default: module.CoverPreviewCardPopup })),
);

/** Starts loading the card, so it is ready by the time the open delay ends. */
export function preloadCoverPreviewCard(): void {
  void loadCoverPreview();
}

type CoverPreviewCardProps = {
  hoverCard: HoverCardState;
  /** The bookmark a target's id names, as the table knows it; none closes the card. */
  resolve: (id: string) => HoverCardBookmark | undefined;
};

export function CoverPreviewCard({ hoverCard, resolve }: CoverPreviewCardProps) {
  const { controller, target, lastTarget, contentId } = hoverCard;
  if (!lastTarget) return null;
  const bookmark = resolve(lastTarget.id);
  if (!bookmark) return null;
  return (
    <Suspense fallback={null}>
      <LazyCoverPreviewCard
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
