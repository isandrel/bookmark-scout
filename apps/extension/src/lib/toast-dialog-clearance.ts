/**
 * Keeps the toast stack off an open dialog's footer buttons. Toasts sit above dialogs so they stay
 * readable and announced, but a toast that lands on Cancel or Import hides the control the dialog
 * is waiting for (WCAG 2.2, 2.4.11 Focus Not Obscured). While a dialog footer is mounted, the
 * stack is limited to the band between the footer and its Toast Position edge, or, when it does
 * not fit there, to the band on the footer's other side. It never moves sideways, so the user's
 * corner or edge is kept.
 */

/** A box in window coordinates, as `getBoundingClientRect` returns it. */
export type ClearanceRect = Pick<DOMRectReadOnly, 'top' | 'bottom' | 'left' | 'right'>;

/**
 * Where the stack goes while a dialog footer is open: anchored to `edge`, `offsetPx` from it,
 * and at most `maxHeightPx` tall (the viewport's own cap still applies).
 */
export type ToastStackPlacement = {
  edge: 'top' | 'bottom';
  offsetPx: number;
  maxHeightPx: number;
};

export type ToastStackClearanceInput = {
  position: ToastPosition;
  windowHeight: number;
  /** The toast viewport's box; only its left and right are used. */
  stack: ClearanceRect;
  /** The height the stack's toasts need (the viewport's `scrollHeight`). */
  stackHeight: number;
  footer: ClearanceRect;
  gapPx: number;
};

/** Where the toast stack keeps clear of `footer`, or `null` when it cannot reach it. */
export function placeToastStackClearOf({
  position,
  windowHeight,
  stack,
  stackHeight,
  footer,
  gapPx,
}: ToastStackClearanceInput): ToastStackPlacement | null {
  // Beside the footer (a corner stack next to a narrow dialog), it can grow as usual.
  if (stack.right <= footer.left || stack.left >= footer.right) return null;
  const above = Math.max(0, footer.top - gapPx);
  const below = Math.max(0, windowHeight - footer.bottom - gapPx);
  const atBottom = position.startsWith('bottom');
  const own = atBottom ? below : above;
  const other = atBottom ? above : below;
  if (stackHeight <= own || own >= other) {
    return { edge: atBottom ? 'bottom' : 'top', offsetPx: 0, maxHeightPx: own };
  }
  return atBottom
    ? { edge: 'bottom', offsetPx: windowHeight - footer.top + gapPx, maxHeightPx: other }
    : { edge: 'top', offsetPx: footer.bottom + gapPx, maxHeightPx: other };
}

export function sameToastStackPlacement(
  a: ToastStackPlacement | null,
  b: ToastStackPlacement | null,
): boolean {
  if (!a || !b) return a === b;
  return a.edge === b.edge && a.offsetPx === b.offsetPx && a.maxHeightPx === b.maxHeightPx;
}

// The footers of the dialogs open on this page, oldest first; the newest belongs to the dialog on
// top. DialogFooter adds its element while mounted.
let dialogFooters: readonly HTMLElement[] = [];
const dialogFooterListeners = new Set<() => void>();

function setDialogFooters(next: readonly HTMLElement[]) {
  dialogFooters = next;
  for (const listener of dialogFooterListeners) listener();
}

/** Adds a dialog footer for the toast stack to keep clear of; returns its removal. */
export function registerDialogFooter(element: HTMLElement): () => void {
  setDialogFooters([...dialogFooters, element]);
  return () => setDialogFooters(dialogFooters.filter((footer) => footer !== element));
}

export function subscribeDialogFooters(listener: () => void): () => void {
  dialogFooterListeners.add(listener);
  return () => dialogFooterListeners.delete(listener);
}

/** The footer of the topmost open dialog, if it has one. */
export function getTopDialogFooter(): HTMLElement | null {
  return dialogFooters.at(-1) ?? null;
}
