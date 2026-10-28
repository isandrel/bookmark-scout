import { type RefObject, useLayoutEffect, useState, useSyncExternalStore } from 'react';

/**
 * The toast viewport's placement while a dialog with a footer is open (`placeToastStackClearOf`),
 * measured again whenever the footer, its dialog, the window, or the toasts change. Nothing
 * changes for focus or announcements: the stack only moves.
 */
export function useToastDialogClearance(
  viewportRef: RefObject<HTMLElement | null>,
  position: ToastPosition,
): ToastStackPlacement | null {
  const footer = useSyncExternalStore(
    subscribeDialogFooters,
    getTopDialogFooter,
    getTopDialogFooter,
  );
  const [placement, setPlacement] = useState<ToastStackPlacement | null>(null);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!footer || !viewport) {
      setPlacement(null);
      return;
    }
    const win = viewport.ownerDocument.defaultView ?? window;
    const update = () => {
      const next = placeToastStackClearOf({
        position,
        windowHeight: win.innerHeight,
        stack: viewport.getBoundingClientRect(),
        stackHeight: viewport.scrollHeight,
        footer: footer.getBoundingClientRect(),
        gapPx: TOAST_DIALOG_FOOTER_GAP_PX,
      });
      setPlacement((current) => (sameToastStackPlacement(current, next) ? current : next));
    };
    update();
    // A capped stack keeps its size as toasts come and go, so the toasts are watched too.
    const resize = new ResizeObserver(update);
    resize.observe(viewport);
    resize.observe(footer);
    const dialog = footer.closest('[role="dialog"], [role="alertdialog"]');
    if (dialog) resize.observe(dialog);
    const toasts = new MutationObserver(update);
    toasts.observe(viewport, { childList: true, subtree: true, characterData: true });
    win.addEventListener('resize', update);
    // The dialog zooms in from 95%, which moves its footer without resizing it.
    win.addEventListener('animationend', update, true);
    return () => {
      resize.disconnect();
      toasts.disconnect();
      win.removeEventListener('resize', update);
      win.removeEventListener('animationend', update, true);
    };
  }, [footer, position, viewportRef]);

  return placement;
}
