/**
 * Keeps the toast stack off an open dialog. Toasts sit above dialogs so they stay readable and
 * announced, but a toast that lands on Cancel, Import, or Unlock hides the control the dialog is
 * waiting for (WCAG 2.2, 2.4.11 Focus Not Obscured). While a dialog is open, the stack keeps clear
 * of the whole dialog when it fits above or below it; otherwise it keeps clear of the dialog's
 * action areas (its footer and every `DialogActions` row), in the free band nearest its Toast
 * Position edge that holds it, or the tallest one when none does. It never moves sideways, so the
 * user's corner or edge is kept, and a stack beside the dialog is left alone.
 */

/** A box in window coordinates, as `getBoundingClientRect` returns it. */
export type ClearanceRect = Pick<DOMRectReadOnly, 'top' | 'bottom' | 'left' | 'right'>;

/**
 * Where the stack goes while a dialog is open: anchored to `edge`, `offsetPx` from it, and at
 * most `maxHeightPx` tall (the viewport's own cap still applies).
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
  /** The open dialog's box. */
  dialog: ClearanceRect;
  /** The dialog's action areas: its footer and `DialogActions` rows. */
  actions: readonly ClearanceRect[];
  gapPx: number;
};

/** The `data-slot` names of a dialog's action areas, set by `DialogFooter` and `DialogActions`. */
export const DIALOG_ACTION_SLOTS = {
  footer: 'dialog-footer',
  actions: 'dialog-actions',
} as const;

/** Finds every action area inside an open dialog. */
export const DIALOG_ACTION_AREA_SELECTOR = Object.values(DIALOG_ACTION_SLOTS)
  .map((slot) => `[data-slot="${slot}"]`)
  .join(', ');

type Band = { top: number; bottom: number };

const height = (band: Band) => band.bottom - band.top;

/** The vertical bands of the window that none of `boxes` (each widened by `gapPx`) reaches. */
function freeBands(boxes: readonly ClearanceRect[], windowHeight: number, gapPx: number): Band[] {
  const bands: Band[] = [];
  let top = 0;
  for (const box of [...boxes].sort((a, b) => a.top - b.top)) {
    const bottom = Math.min(windowHeight, box.top - gapPx);
    if (bottom > top) bands.push({ top, bottom });
    top = Math.max(top, box.bottom + gapPx);
  }
  if (windowHeight > top) bands.push({ top, bottom: windowHeight });
  return bands;
}

/** Where the stack goes in `band`, anchored to its own edge so it grows away from that edge. */
function placeIn(band: Band, atBottom: boolean, windowHeight: number): ToastStackPlacement {
  return atBottom
    ? { edge: 'bottom', offsetPx: windowHeight - band.bottom, maxHeightPx: height(band) }
    : { edge: 'top', offsetPx: band.top, maxHeightPx: height(band) };
}

/** Where the toast stack keeps clear of the open dialog, or `null` when it need not move. */
export function placeToastStackClearOf({
  position,
  windowHeight,
  stack,
  stackHeight,
  dialog,
  actions,
  gapPx,
}: ToastStackClearanceInput): ToastStackPlacement | null {
  // Only boxes in the stack's column matter; a corner stack beside a narrow dialog is left alone.
  const inColumn = (box: ClearanceRect) => box.left < stack.right && box.right > stack.left;
  if (!inColumn(dialog)) return null;
  const atBottom = position.startsWith('bottom');
  // Nearest the Toast Position edge first.
  const fromOwnEdge = (bands: Band[]) => (atBottom ? bands.reverse() : bands);

  const clearOfDialog = fromOwnEdge(freeBands([dialog], windowHeight, gapPx)).find(
    (band) => height(band) >= stackHeight,
  );
  if (clearOfDialog) return placeIn(clearOfDialog, atBottom, windowHeight);

  const areas = actions.filter(inColumn);
  if (areas.length === 0) return null;
  const bands = fromOwnEdge(freeBands(areas, windowHeight, gapPx));
  const fitting = bands.find((band) => height(band) >= stackHeight);
  // When no band holds the whole stack, the tallest one shows the most of it (and scrolls).
  const best =
    fitting ??
    bands.reduce<Band | undefined>((a, b) => (a && height(a) >= height(b) ? a : b), undefined);
  return best
    ? placeIn(best, atBottom, windowHeight)
    : { edge: atBottom ? 'bottom' : 'top', offsetPx: 0, maxHeightPx: 0 };
}

export function sameToastStackPlacement(
  a: ToastStackPlacement | null,
  b: ToastStackPlacement | null,
): boolean {
  if (!a || !b) return a === b;
  return a.edge === b.edge && a.offsetPx === b.offsetPx && a.maxHeightPx === b.maxHeightPx;
}

// The dialogs open on this page, oldest first; the newest is the one on top. DialogContent adds
// its popup while mounted.
let openDialogs: readonly HTMLElement[] = [];
const openDialogListeners = new Set<() => void>();

function setOpenDialogs(next: readonly HTMLElement[]) {
  openDialogs = next;
  for (const listener of openDialogListeners) listener();
}

/** Adds an open dialog for the toast stack to keep clear of; returns its removal. */
export function registerOpenDialog(element: HTMLElement): () => void {
  setOpenDialogs([...openDialogs, element]);
  return () => setOpenDialogs(openDialogs.filter((dialog) => dialog !== element));
}

export function subscribeOpenDialogs(listener: () => void): () => void {
  openDialogListeners.add(listener);
  return () => openDialogListeners.delete(listener);
}

/** The topmost open dialog, if any. */
export function getTopOpenDialog(): HTMLElement | null {
  return openDialogs.at(-1) ?? null;
}

/**
 * The parts of `dialog`'s action areas that show: each clipped to the dialog's box, so a row
 * scrolled out of a long dialog's body does not push the stack around.
 */
export function visibleDialogActionAreas(
  dialog: ClearanceRect,
  areas: readonly ClearanceRect[],
): ClearanceRect[] {
  return areas.flatMap((area) => {
    const clipped = {
      top: Math.max(area.top, dialog.top),
      bottom: Math.min(area.bottom, dialog.bottom),
      left: Math.max(area.left, dialog.left),
      right: Math.min(area.right, dialog.right),
    };
    return clipped.bottom > clipped.top && clipped.right > clipped.left ? [clipped] : [];
  });
}
