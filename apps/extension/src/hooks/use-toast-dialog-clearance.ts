import { type RefObject, useLayoutEffect, useState, useSyncExternalStore } from 'react';

/**
 * The toast viewport's placement while a dialog is open (`placeToastStackClearOf`), measured again
 * whenever the dialog, its action areas, the window, or the toasts change. Nothing changes for
 * focus or announcements: the stack only moves.
 */
export function useToastDialogClearance(
  viewportRef: RefObject<HTMLElement | null>,
  position: ToastPosition,
): ToastStackPlacement | null {
  const dialog = useSyncExternalStore(subscribeOpenDialogs, getTopOpenDialog, getTopOpenDialog);
  const [placement, setPlacement] = useState<ToastStackPlacement | null>(null);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!dialog || !viewport) {
      setPlacement(null);
      return;
    }
    const win = viewport.ownerDocument.defaultView ?? window;
    // Scrolling and typing in the dialog can fire many times a frame; measure once per frame.
    let frame = 0;
    const update = () => {
      frame = 0;
      const dialogBox = dialog.getBoundingClientRect();
      const areas = [...dialog.querySelectorAll(DIALOG_ACTION_AREA_SELECTOR)].map((area) =>
        area.getBoundingClientRect(),
      );
      const next = placeToastStackClearOf({
        position,
        windowHeight: win.innerHeight,
        stack: viewport.getBoundingClientRect(),
        stackHeight: viewport.scrollHeight,
        dialog: dialogBox,
        actions: visibleDialogActionAreas(dialogBox, areas),
        gapPx: TOAST_DIALOG_GAP_PX,
      });
      setPlacement((current) => (sameToastStackPlacement(current, next) ? current : next));
    };
    const schedule = () => {
      if (!frame) frame = win.requestAnimationFrame(update);
    };
    update();
    // A capped stack keeps its size as toasts come and go, so the toasts are watched too.
    const resize = new ResizeObserver(schedule);
    resize.observe(viewport);
    resize.observe(dialog);
    // Action areas come and go (an unlock form once the file is unlocked) without the dialog
    // changing size.
    const changes = new MutationObserver(schedule);
    changes.observe(viewport, { childList: true, subtree: true, characterData: true });
    changes.observe(dialog, { childList: true, subtree: true });
    win.addEventListener('resize', schedule);
    // Rows in a scrolling dialog body move without resizing anything.
    win.addEventListener('scroll', schedule, true);
    // The dialog zooms in from 95%, which moves its action areas without resizing them.
    win.addEventListener('animationend', schedule, true);
    return () => {
      if (frame) win.cancelAnimationFrame(frame);
      resize.disconnect();
      changes.disconnect();
      win.removeEventListener('resize', schedule);
      win.removeEventListener('scroll', schedule, true);
      win.removeEventListener('animationend', schedule, true);
    };
  }, [dialog, position, viewportRef]);

  return placement;
}
