"use client";

import { isApplePlatform } from "@bookmark-scout/config/shortcuts";
import { useEffect } from "react";

/**
 * Marks `<html data-platform="mac">` (macOS, iPadOS, iOS) or `"other"` after hydration, so
 * `<Shortcut>` shows only the reader's keys. The exported HTML has no mark and shows both
 * platforms, which is also what a reader without JavaScript sees.
 */
export function PlatformAttribute() {
  useEffect(() => {
    document.documentElement.dataset.platform = isApplePlatform()
      ? "mac"
      : "other";
  }, []);
  return null;
}
