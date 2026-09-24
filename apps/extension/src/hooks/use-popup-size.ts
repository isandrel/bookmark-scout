/**
 * Apply the popupWidth/popupHeight settings to the popup document. Only popup.html reads the
 * `--popup-width`/`--popup-height` variables; the side panel always fills its pane.
 */

import { useEffect } from 'react';

/** Chrome and Edge cap extension popups at 800x600 px; smaller than 300 px is unusable. */
export const POPUP_SIZE_LIMITS = {
  width: { min: 300, max: 800 },
  height: { min: 300, max: 600 },
} as const;

export function clampPopupSize(width: number, height: number): { width: number; height: number } {
  const clamp = (value: number, { min, max }: { min: number; max: number }) =>
    Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : min));
  return {
    width: clamp(width, POPUP_SIZE_LIMITS.width),
    height: clamp(height, POPUP_SIZE_LIMITS.height),
  };
}

export function usePopupSize(): void {
  const { settings, isLoading } = useSettings();
  const { popupWidth, popupHeight } = settings;

  useEffect(() => {
    if (isLoading) return;
    const { width, height } = clampPopupSize(popupWidth, popupHeight);
    const root = document.documentElement.style;
    root.setProperty('--popup-width', `${width}px`);
    root.setProperty('--popup-height', `${height}px`);
  }, [isLoading, popupWidth, popupHeight]);
}
