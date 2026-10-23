/**
 * The bookmark hover card's rules, apart from React: its tunables (config/ui/hover-card.toml), when
 * it opens and closes (`createHoverCardController`), and the bookmark it shows. What the card lists
 * is `hover-card-content.ts`, which only the card (`BookmarkHoverCard.lazy.tsx`) loads.
 *
 * Open and close follow WCAG 1.4.13 (content on hover or focus): the card opens after the pointer
 * rests on a row or keyboard focus stays on it, stays while the pointer is on the row or the card
 * or the row keeps focus, and Escape dismisses it without moving either. A dismissed card stays
 * closed until the pointer and focus have both left that row.
 */
import { z } from 'zod';

const hoverCardConfig = readConfig(
  'ui/hover-card',
  z.strictObject({
    open_delay_ms: z.number().int().nonnegative(),
    close_delay_ms: z.number().int().nonnegative(),
    max_width_px: z.number().int().positive(),
    edge_gap_px: z.number().int().nonnegative(),
    row_gap_px: z.number().int().nonnegative(),
    summary_max_height_px: z.number().int().positive(),
    max_tags: z.number().int().positive(),
    cover_width_px: z.number().int().positive(),
    cover_preview_max_width_px: z.number().int().positive(),
  }),
);

/** How long the pointer or keyboard focus rests on a row before its card opens, in ms. */
export const HOVER_CARD_OPEN_DELAY_MS = hoverCardConfig.open_delay_ms;
/** How long the card stays after the pointer leaves both the row and the card, in ms. */
export const HOVER_CARD_CLOSE_DELAY_MS = hoverCardConfig.close_delay_ms;
/** The card's widest width, in pixels. */
export const HOVER_CARD_MAX_WIDTH_PX = hoverCardConfig.max_width_px;
/** Room kept between the card and the window's edges, in pixels. */
export const HOVER_CARD_EDGE_GAP_PX = hoverCardConfig.edge_gap_px;
/** Room between the card and its row, in pixels. */
export const HOVER_CARD_ROW_GAP_PX = hoverCardConfig.row_gap_px;
/** The summary scrolls inside the card past this height, in pixels. */
export const HOVER_CARD_SUMMARY_MAX_HEIGHT_PX = hoverCardConfig.summary_max_height_px;
/** Tag chips the card shows before a "+N" chip. */
export const HOVER_CARD_MAX_TAGS = hoverCardConfig.max_tags;
/** Width of the stored cover's thumbnail, in pixels. */
export const HOVER_CARD_COVER_WIDTH_PX = hoverCardConfig.cover_width_px;
/** The widest the Cover column's larger cover shows, in pixels (never wider than stored). */
export const COVER_PREVIEW_MAX_WIDTH_PX = hoverCardConfig.cover_preview_max_width_px;

/** What a card is about: a bookmark, and the element it is drawn against. */
export type HoverCardTarget = {
  /** The bookmark's id; a card for the same id is the same card. */
  id: string;
  /** The row (or cell) the card is placed against. */
  anchor: HTMLElement;
  /** The element that holds focus for the row, which the card describes (`aria-describedby`). */
  described: HTMLElement;
};

type HoverCardControllerOptions = {
  openDelayMs: number;
  closeDelayMs: number;
  /** Called with the target whose card should now show, or null when none should. */
  onChange: (target: HoverCardTarget | null) => void;
};

export type HoverCardController = {
  /** The pointer is on a target's row; null when it is on none (or left the list). */
  hover: (target: HoverCardTarget | null) => void;
  /** Keyboard focus is on a target's row; null when it left (or is not keyboard focus). */
  focus: (target: HoverCardTarget | null) => void;
  /** The pointer moved onto (true) or off (false) the open card. */
  hoverCard: (over: boolean) => void;
  /** Closes the card now (Escape, a press, a drag) and keeps it closed until its row is left. */
  dismiss: () => void;
  /** The target shown, if any. */
  current: () => HoverCardTarget | null;
  /** Stops the timers, as a page that unmounts must; the next event starts them again. */
  cancel: () => void;
};

/**
 * When the card opens and closes. A target the pointer rests on, or keyboard focus stays on, for
 * `openDelayMs` opens its card; the card stays while the pointer is on its row or on the card, or
 * the row keeps focus, and closes `closeDelayMs` after none of these holds. Moving to another row
 * closes the shown card after the close delay and opens the new one after the open delay, so a
 * pointer sweeping down a list never opens a card on the way.
 */
export function createHoverCardController({
  openDelayMs,
  closeDelayMs,
  onChange,
}: HoverCardControllerOptions): HoverCardController {
  let shown: HoverCardTarget | null = null;
  let hovered: HoverCardTarget | null = null;
  let focused: HoverCardTarget | null = null;
  let overCard = false;
  let dismissedId: string | null = null;
  let pending: { target: HoverCardTarget; timer: ReturnType<typeof setTimeout> } | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  const cancelOpen = () => {
    if (pending) clearTimeout(pending.timer);
    pending = null;
  };
  const cancelClose = () => {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = null;
  };
  const show = (target: HoverCardTarget | null) => {
    if (shown === target) return;
    shown = target;
    overCard = false;
    onChange(target);
  };

  const update = () => {
    // A dismissed card may open again once the pointer and focus have both left its row.
    if (dismissedId !== null && hovered?.id !== dismissedId && focused?.id !== dismissedId) {
      dismissedId = null;
    }
    const wanted = overCard && shown ? shown : (hovered ?? focused);
    const desired = wanted && wanted.id !== dismissedId ? wanted : null;

    if (shown && desired?.id !== shown.id) {
      closeTimer ??= setTimeout(() => {
        closeTimer = null;
        show(null);
        update();
      }, closeDelayMs);
    } else {
      cancelClose();
    }

    if (!desired || desired.id === shown?.id) {
      cancelOpen();
      return;
    }
    if (pending?.target.id === desired.id) {
      pending.target = desired;
      return;
    }
    cancelOpen();
    pending = {
      target: desired,
      timer: setTimeout(() => {
        const target = pending?.target ?? null;
        pending = null;
        cancelClose();
        show(target);
      }, openDelayMs),
    };
  };

  return {
    hover: (target) => {
      hovered = target;
      update();
    },
    focus: (target) => {
      focused = target;
      update();
    },
    hoverCard: (over) => {
      if (!shown) return;
      overCard = over;
      update();
    },
    dismiss: () => {
      const id = shown?.id ?? pending?.target.id ?? hovered?.id ?? focused?.id ?? null;
      cancelOpen();
      cancelClose();
      dismissedId = id;
      show(null);
    },
    current: () => shown,
    cancel: () => {
      cancelOpen();
      cancelClose();
    },
  };
}

/** A bookmark as the card shows it; the popup and the manager each build one from their rows. */
export type HoverCardBookmark = {
  id: string;
  title: string;
  url: string;
  /** Folder names from the top, joined with `FOLDER_PATH_SEPARATOR`; empty at the top level. */
  folderPath: string;
  dateAdded?: number;
};

/** The folder path of a node from parent lookups, top folder first, without the unnamed root. */
export function folderPathOf(
  parentId: string | undefined,
  lookup: (id: string) => { title: string; parentId?: string } | undefined,
): string {
  const names: string[] = [];
  const seen = new Set<string>();
  let id = parentId;
  while (id !== undefined && !seen.has(id)) {
    seen.add(id);
    const folder = lookup(id);
    // The browser's root has no parent and no name of its own.
    if (!folder || folder.parentId === undefined) break;
    names.unshift(getBookmarkDisplayTitle(folder.title));
    id = folder.parentId;
  }
  return names.join(FOLDER_PATH_SEPARATOR);
}
