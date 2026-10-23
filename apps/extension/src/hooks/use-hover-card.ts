/**
 * One bookmark hover card for a list of rows (`createHoverCardController` in
 * `src/lib/hover-card.ts` decides when it opens). The list reports the pointer and keyboard focus
 * through `controller`, and `BookmarkHoverCard` draws the card for `target`.
 *
 * While a card shows, Escape closes it before anything else on the page sees the key, so it never
 * also clears the search or leaves a field, and the row it describes points to it with
 * `aria-describedby`.
 */
import { useEffect, useId, useRef, useState } from 'react';

/** The key that dismisses content shown on hover or focus (WCAG 1.4.13). */
const DISMISS_KEY = 'Escape';
const DESCRIBED_BY = 'aria-describedby';

export type HoverCardState = {
  controller: HoverCardController;
  /** The target whose card shows, or null. */
  target: HoverCardTarget | null;
  /** The last target shown, kept while its card animates closed. */
  lastTarget: HoverCardTarget | null;
  /** The id of the card's content, which the described row names. */
  contentId: string;
};

export function useHoverCard(enabled: boolean): HoverCardState {
  const contentId = useId();
  const [shown, setShown] = useState<{
    target: HoverCardTarget | null;
    lastTarget: HoverCardTarget | null;
  }>({ target: null, lastTarget: null });
  // Hover Card Delay; read when a card is about to open, so a change applies without a reload.
  const { value: openDelayMs } = useSetting('hoverCardOpenDelayMs');
  const openDelayRef = useRef(openDelayMs);
  openDelayRef.current = openDelayMs;
  const [controller] = useState(() =>
    createHoverCardController({
      openDelayMs: () => openDelayRef.current,
      closeDelayMs: HOVER_CARD_CLOSE_DELAY_MS,
      onChange: (target) =>
        setShown((previous) => ({ target, lastTarget: target ?? previous.lastTarget })),
    }),
  );

  useEffect(() => () => controller.cancel(), [controller]);

  // Turning the setting off closes a card that is open or about to open.
  useEffect(() => {
    if (!enabled) controller.dismiss();
  }, [enabled, controller]);

  const { target } = shown;

  useEffect(() => {
    if (!target) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== DISMISS_KEY || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      controller.dismiss();
    };
    // Capture on the window runs before the page's own Escape handlers.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [target, controller]);

  useEffect(() => {
    if (!target) return;
    const element = target.described;
    const previous = element.getAttribute(DESCRIBED_BY);
    element.setAttribute(DESCRIBED_BY, previous ? `${previous} ${contentId}` : contentId);
    return () => {
      if (previous === null) element.removeAttribute(DESCRIBED_BY);
      else element.setAttribute(DESCRIBED_BY, previous);
    };
  }, [target, contentId]);

  return { controller, target, lastTarget: shown.lastTarget, contentId };
}
