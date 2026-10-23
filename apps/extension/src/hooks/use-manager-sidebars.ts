/**
 * The bookmark manager's folder and tools sidebars, sized by config/ui/layout.toml:
 *
 * - Wide windows show them beside the table; narrower than `both_sidebars_min_width`, opening one
 *   closes the other.
 * - Narrower than `sidebar_overlay_below_width`, they open over the table as drawers instead of
 *   taking its room (`overlay`), are closed when the page loads, and close again once used.
 * - Each opens on load as configured, or as it was last on this device when Sidebars on Open
 *   (`managerSidebarsStart`) is "remember"; its width is the one the user dragged or keyed it to
 *   on this device (`managerSidebarsValue`), within the configured bounds.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';

const widthSchema = z.strictObject({
  value: z.number().int().positive(),
  min: z.number().int().positive(),
  max: z.number().int().positive(),
});

const layout = readConfig(
  'ui/layout',
  z.strictObject({
    manager: z.strictObject({
      both_sidebars_min_width: z.number().int().positive(),
      sidebar_overlay_below_width: z.number().int().positive(),
      folders_open: z.boolean(),
      tools_open: z.boolean(),
      folders_width_px: widthSchema.refine(
        ({ value, min, max }) => min <= value && value <= max,
        'value must be between min and max',
      ),
      tools_width_px: widthSchema.refine(
        ({ value, min, max }) => min <= value && value <= max,
        'value must be between min and max',
      ),
      resize_step_px: boundedNumber({ integer: true }),
      resize_big_step_px: boundedNumber({ integer: true }),
      max_width_percent: boundedNumber({ integer: true }),
    }),
  }),
).manager;

export type ManagerSidebarId = 'folders' | 'tools';

/** Each sidebar's starting width and the range the user can resize it in, in pixels. */
export const MANAGER_SIDEBAR_WIDTHS: Readonly<
  Record<ManagerSidebarId, { value: number; min: number; max: number }>
> = { folders: layout.folders_width_px, tools: layout.tools_width_px };

/** How far one arrow key press on a sidebar's handle resizes it, and with Shift, in pixels. */
export const MANAGER_SIDEBAR_RESIZE_STEPS = {
  small: layout.resize_step_px,
  big: layout.resize_big_step_px,
} as const;

/** The most of the window's width a sidebar may take, as a CSS length. */
export const MANAGER_SIDEBAR_MAX_WIDTH = `${layout.max_width_percent}vw`;

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

/** A width within the sidebar's configured range. */
export function clampManagerSidebarWidth(id: ManagerSidebarId, width: number): number {
  const { min, max } = MANAGER_SIDEBAR_WIDTHS[id];
  return Math.round(Math.min(max, Math.max(min, width)));
}

/**
 * Whether each sidebar opens when the page loads: as last left on this device when the setting
 * says to remember and that is known, else as configured.
 */
export function getManagerSidebarsOnOpen(
  start: Settings['managerSidebarsStart'],
  saved: ManagerSidebarsState,
): { folders: boolean; tools: boolean } {
  const remember = start === 'remember';
  return {
    folders: (remember ? saved.foldersOpen : undefined) ?? layout.folders_open,
    tools: (remember ? saved.toolsOpen : undefined) ?? layout.tools_open,
  };
}

export type ManagerSidebar = {
  open: boolean;
  toggle: () => void;
  close: () => void;
  /** The width in pixels, within `MANAGER_SIDEBAR_WIDTHS`. */
  width: number;
  /** Shows a new width; `save` keeps it for next time (at the end of a drag or a key press). */
  resize: (width: number, save: boolean) => void;
};

export function useManagerSidebars(): {
  /** The sidebars open over the table, as drawers. */
  overlay: boolean;
  folders: ManagerSidebar;
  tools: ManagerSidebar;
} {
  const overlay = useMediaQuery(OVERLAY_QUERY);
  // Read before the first render (the manager's preload), so the sidebars open as they will stay.
  const [onOpen] = useState(() => {
    const settings = getStoredValueStore(settingsValue).getSnapshot().value;
    const saved = getStoredValueStore(managerSidebarsValue).getSnapshot().value;
    return { ...getManagerSidebarsOnOpen(settings.managerSidebarsStart, saved), saved };
  });
  const [foldersOpen, setFoldersOpen] = useState(() => onOpen.folders && !matches(OVERLAY_QUERY));
  // Options' Export bookmarks button and a Smart Rules conflict's Review link open the page on
  // the Tools sidebar.
  const [toolsOpen, setToolsOpen] = useState(
    () =>
      window.location.hash === `#${MANAGER_EXPORT_HASH}` ||
      window.location.hash === `#${MANAGER_RULES_HASH}` ||
      (onOpen.tools && !matches(OVERLAY_QUERY)),
  );
  const [foldersWidth, setFoldersWidth] = useState(() =>
    clampManagerSidebarWidth('folders', onOpen.saved.foldersWidth ?? layout.folders_width_px.value),
  );
  const [toolsWidth, setToolsWidth] = useState(() =>
    clampManagerSidebarWidth('tools', onOpen.saved.toolsWidth ?? layout.tools_width_px.value),
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

  // What the user opened or closed is kept for "remember"; drawers say nothing about that.
  const saveOpen = useCallback(
    (changes: Pick<ManagerSidebarsState, 'foldersOpen' | 'toolsOpen'>) => {
      if (matches(OVERLAY_QUERY)) return;
      void managerSidebarsValue
        .update((current) => ({ ...current, ...changes }))
        .catch(() => undefined);
    },
    [],
  );

  const toggleFolders = useCallback(() => {
    const next = !foldersOpen;
    const closesTools = next && toolsOpen && !matches(BOTH_SIDEBARS_QUERY);
    if (closesTools) setToolsOpen(false);
    setFoldersOpen(next);
    saveOpen({ foldersOpen: next, ...(closesTools ? { toolsOpen: false } : {}) });
  }, [foldersOpen, saveOpen, toolsOpen]);
  const toggleTools = useCallback(() => {
    const next = !toolsOpen;
    const closesFolders = next && foldersOpen && !matches(BOTH_SIDEBARS_QUERY);
    if (closesFolders) setFoldersOpen(false);
    setToolsOpen(next);
    saveOpen({ toolsOpen: next, ...(closesFolders ? { foldersOpen: false } : {}) });
  }, [foldersOpen, saveOpen, toolsOpen]);
  const closeFolders = useCallback(() => {
    setFoldersOpen(false);
    saveOpen({ foldersOpen: false });
  }, [saveOpen]);
  const closeTools = useCallback(() => {
    setToolsOpen(false);
    saveOpen({ toolsOpen: false });
  }, [saveOpen]);

  const resizer = useCallback(
    (id: ManagerSidebarId, setWidth: (width: number) => void) => (width: number, save: boolean) => {
      const next = clampManagerSidebarWidth(id, width);
      setWidth(next);
      if (!save) return;
      const key = id === 'folders' ? 'foldersWidth' : 'toolsWidth';
      void managerSidebarsValue
        .update((current) => ({ ...current, [key]: next }))
        .catch(() => undefined);
    },
    [],
  );
  const resizeFolders = useCallback(
    (width: number, save: boolean) => resizer('folders', setFoldersWidth)(width, save),
    [resizer],
  );
  const resizeTools = useCallback(
    (width: number, save: boolean) => resizer('tools', setToolsWidth)(width, save),
    [resizer],
  );

  return {
    overlay,
    folders: {
      open: foldersOpen,
      toggle: toggleFolders,
      close: closeFolders,
      width: foldersWidth,
      resize: resizeFolders,
    },
    tools: {
      open: toolsOpen,
      toggle: toggleTools,
      close: closeTools,
      width: toolsWidth,
      resize: resizeTools,
    },
  };
}
