/**
 * Apply the popupWidth/popupHeight settings to the popup document. Only popup.html reads the
 * `--popup-width`/`--popup-height` variables; the side panel always fills its pane.
 */

import { useEffect } from 'react';

/** CSS variables popup.html sizes itself with; its inline defaults are unit-tested. */
export const POPUP_SIZE_CSS_VARS = { width: '--popup-width', height: '--popup-height' } as const;

/** The popupWidth/popupHeight bounds from config/settings/advanced.toml. */
export const POPUP_SIZE_LIMITS = {
  width: SETTING_NUMBER_BOUNDS.popupWidth,
  height: SETTING_NUMBER_BOUNDS.popupHeight,
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
    root.setProperty(POPUP_SIZE_CSS_VARS.width, `${width}px`);
    root.setProperty(POPUP_SIZE_CSS_VARS.height, `${height}px`);
  }, [isLoading, popupWidth, popupHeight]);
}
