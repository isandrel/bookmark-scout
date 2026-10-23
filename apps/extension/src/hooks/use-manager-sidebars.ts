/**
 * The bookmark manager's folder and tools sidebars, sized by config/ui/layout.toml:
 *
 * - Wide windows show them beside the table; narrower than `both_sidebars_min_width`, opening one
 *   closes the other.
 * - Narrower than `sidebar_overlay_below_width`, they open over the table as drawers instead of
 *   taking its room (`overlay`), are closed when the page loads, and close again once used.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { z } from 'zod';

const layout = readConfig(
  'ui/layout',
  z.strictObject({
    manager: z.strictObject({
      both_sidebars_min_width: z.number().int().positive(),
      sidebar_overlay_below_width: z.number().int().positive(),
      folders_open: z.boolean(),
      tools_open: z.boolean(),
    }),
  }),
).manager;

const BOTH_SIDEBARS_QUERY = `(min-width: ${layout.both_sidebars_min_width}px)`;
const OVERLAY_QUERY = `(max-width: ${layout.sidebar_overlay_below_width - 1}px)`;

const matches = (query: string) => window.matchMedia(query).matches;

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => matches(query));
}

export type ManagerSidebar = { open: boolean; toggle: () => void; close: () => void };

export function useManagerSidebars(): {
  /** The sidebars open over the table, as drawers. */
  overlay: boolean;
  folders: ManagerSidebar;
  tools: ManagerSidebar;
} {
  const overlay = useMediaQuery(OVERLAY_QUERY);
  const [foldersOpen, setFoldersOpen] = useState(
    () => layout.folders_open && !matches(OVERLAY_QUERY),
  );
  // Options' Export bookmarks button and a Smart Rules conflict's Review link open the page on
  // the Tools sidebar.
  const [toolsOpen, setToolsOpen] = useState(
    () =>
      window.location.hash === `#${MANAGER_EXPORT_HASH}` ||
      window.location.hash === `#${MANAGER_RULES_HASH}` ||
      (layout.tools_open && !matches(OVERLAY_QUERY)),
  );

  // Shrinking the window: drawers start closed, and both sidebars together leave the folders.
  // The page already starts with them closed in a narrow window, unless a link asked for one.
  const wasOverlay = useRef(overlay);
  useEffect(() => {
    if (overlay && !wasOverlay.current) {
      setFoldersOpen(false);
      setToolsOpen(false);
    }
    wasOverlay.current = overlay;
  }, [overlay]);
  useEffect(() => {
    if (!foldersOpen || !toolsOpen) return;
    const query = window.matchMedia(BOTH_SIDEBARS_QUERY);
    const closeFolders = () => {
      if (!query.matches) setFoldersOpen(false);
    };
    closeFolders();
    query.addEventListener('change', closeFolders);
    return () => query.removeEventListener('change', closeFolders);
  }, [foldersOpen, toolsOpen]);

  const toggleFolders = useCallback(() => {
    if (!foldersOpen && !matches(BOTH_SIDEBARS_QUERY)) setToolsOpen(false);
    setFoldersOpen(!foldersOpen);
  }, [foldersOpen]);
  const toggleTools = useCallback(() => {
    if (!toolsOpen && !matches(BOTH_SIDEBARS_QUERY)) setFoldersOpen(false);
    setToolsOpen(!toolsOpen);
  }, [toolsOpen]);

  return {
    overlay,
    folders: {
      open: foldersOpen,
      toggle: toggleFolders,
      close: useCallback(() => setFoldersOpen(false), []),
    },
    tools: {
      open: toolsOpen,
      toggle: toggleTools,
      close: useCallback(() => setToolsOpen(false), []),
    },
  };
}
