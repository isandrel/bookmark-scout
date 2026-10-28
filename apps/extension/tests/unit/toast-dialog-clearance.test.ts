import { describe, expect, it, vi } from 'vitest';
import {
  type ClearanceRect,
  DIALOG_ACTION_AREA_SELECTOR,
  getTopOpenDialog,
  placeToastStackClearOf,
  registerOpenDialog,
  sameToastStackPlacement,
  subscribeOpenDialogs,
  visibleDialogActionAreas,
} from '@/lib/toast-dialog-clearance';

// A 1100 x 1000 window with a wide restore dialog from y 60 to 924 whose footer row runs from
// y 860 to 900, as in the screenshot that reported the first bug.
const WINDOW_HEIGHT = 1000;
const DIALOG: ClearanceRect = { top: 60, bottom: 924, left: 216, right: 884 };
const FOOTER: ClearanceRect = { top: 860, bottom: 900, left: 240, right: 860 };
// The Unlock row of a password-protected backup, near the top of the dialog's body.
const UNLOCK: ClearanceRect = { top: 220, bottom: 260, left: 240, right: 860 };
const RIGHT_STACK: ClearanceRect = { top: 0, bottom: 0, left: 780, right: 1100 };
const GAP = 8;

function place(
  position: ToastPosition,
  stackHeight: number,
  overrides: {
    stack?: ClearanceRect;
    dialog?: ClearanceRect;
    actions?: readonly ClearanceRect[];
  } = {},
) {
  return placeToastStackClearOf({
    position,
    windowHeight: WINDOW_HEIGHT,
    stack: overrides.stack ?? RIGHT_STACK,
    stackHeight,
    dialog: overrides.dialog ?? DIALOG,
    actions: overrides.actions ?? [FOOTER],
    gapPx: GAP,
  });
}

describe('placeToastStackClearOf', () => {
  it('leaves a stack beside the dialog alone', () => {
    expect(place('bottom-right', 200, { stack: { ...RIGHT_STACK, left: 884 } })).toBeNull();
    expect(
      place('bottom-left', 200, { stack: { top: 0, bottom: 0, left: 0, right: 216 } }),
    ).toBeNull();
  });

  it('keeps the stack on its own edge, clear of the whole dialog, when it fits there', () => {
    // 1000 - 924 - 8 = 68 pixels below the dialog; 60 - 8 = 52 above it.
    expect(place('bottom-right', 60)).toEqual({ edge: 'bottom', offsetPx: 0, maxHeightPx: 68 });
    expect(place('top-left', 52)).toEqual({ edge: 'top', offsetPx: 0, maxHeightPx: 52 });
  });

  it('moves the stack to the far side of the dialog when only that side holds it', () => {
    // 32 pixels below this dialog and 192 above it: the stack's bottom sits 8 pixels above the
    // dialog (1000 - 200 + 8 = 808).
    const low = { top: 200, bottom: 960, left: 216, right: 884 };
    expect(place('bottom-center', 100, { dialog: low })).toEqual({
      edge: 'bottom',
      offsetPx: 808,
      maxHeightPx: 192,
    });
    // 32 above this one and 192 below.
    const high = { top: 40, bottom: 800, left: 216, right: 884 };
    expect(place('top-right', 100, { dialog: high })).toEqual({
      edge: 'top',
      offsetPx: 808,
      maxHeightPx: 192,
    });
  });

  it('keeps clear of the footer when the stack fits on neither side of the dialog', () => {
    // 1000 - 900 - 8 = 92 below the footer.
    expect(place('bottom-right', 80)).toEqual({ edge: 'bottom', offsetPx: 0, maxHeightPx: 92 });
    // Not under it: lifted above the footer (1000 - 860 + 8 = 148).
    expect(place('bottom-right', 210)).toEqual({
      edge: 'bottom',
      offsetPx: 148,
      maxHeightPx: 852,
    });
    expect(place('top-left', 210)).toEqual({ edge: 'top', offsetPx: 0, maxHeightPx: 852 });
  });

  it('keeps clear of every action row, in the free band nearest its own edge that holds it', () => {
    const actions = [FOOTER, UNLOCK];
    // Bottom: the 584 pixels between the Unlock row and the footer (268 to 852), not over Unlock.
    expect(place('bottom-right', 210, { actions })).toEqual({
      edge: 'bottom',
      offsetPx: 148,
      maxHeightPx: 584,
    });
    // Top: the 212 pixels above the Unlock row.
    expect(place('top-right', 210, { actions })).toEqual({
      edge: 'top',
      offsetPx: 0,
      maxHeightPx: 212,
    });
    // Too tall for above it: the band under it.
    expect(place('top-right', 300, { actions })).toEqual({
      edge: 'top',
      offsetPx: 268,
      maxHeightPx: 584,
    });
  });

  it('takes the tallest band when none holds the stack, nearest its own edge on a tie', () => {
    const dialog = { top: 0, bottom: 1000, left: 0, right: 1100 };
    const actions = [
      { top: 400, bottom: 440, left: 0, right: 1100 },
      { top: 0, bottom: 20, left: 0, right: 1100 },
    ];
    expect(place('bottom-right', 2000, { dialog, actions })).toEqual({
      edge: 'bottom',
      offsetPx: 0,
      maxHeightPx: 552,
    });
    expect(place('top-right', 2000, { dialog, actions })).toEqual({
      edge: 'top',
      offsetPx: 448,
      maxHeightPx: 552,
    });
    const even = [{ top: 496, bottom: 504, left: 0, right: 1100 }];
    expect(place('top-right', 2000, { dialog, actions: even })).toEqual({
      edge: 'top',
      offsetPx: 0,
      maxHeightPx: 488,
    });
  });

  it('ignores action areas outside its column, and stays put when none is in it', () => {
    const dialog = { top: 0, bottom: 1000, left: 0, right: 1100 };
    const leftOnly = [{ top: 900, bottom: 960, left: 0, right: 300 }];
    expect(place('bottom-right', 200, { dialog, actions: leftOnly })).toBeNull();
    expect(place('bottom-right', 200, { dialog, actions: [] })).toBeNull();
  });

  it('never gives a negative room', () => {
    const whole = { top: 0, bottom: 1000, left: 0, right: 1100 };
    expect(place('bottom-right', 100, { dialog: whole, actions: [whole] })).toEqual({
      edge: 'bottom',
      offsetPx: 0,
      maxHeightPx: 0,
    });
    expect(place('top-center', 100, { dialog: whole, actions: [whole] })).toEqual({
      edge: 'top',
      offsetPx: 0,
      maxHeightPx: 0,
    });
  });
});

describe('visibleDialogActionAreas', () => {
  it('clips each area to the dialog and drops one scrolled out of it', () => {
    expect(
      visibleDialogActionAreas(DIALOG, [
        UNLOCK,
        { top: 60, bottom: 140, left: 200, right: 900 },
        { top: 940, bottom: 980, left: 240, right: 860 },
      ]),
    ).toEqual([UNLOCK, { top: 60, bottom: 140, left: 216, right: 884 }]);
  });
});

describe('DIALOG_ACTION_AREA_SELECTOR', () => {
  it('finds the footer and every DialogActions row', () => {
    expect(DIALOG_ACTION_AREA_SELECTOR).toBe(
      '[data-slot="dialog-footer"], [data-slot="dialog-actions"]',
    );
  });
});

describe('sameToastStackPlacement', () => {
  it('compares by value', () => {
    const a = { edge: 'bottom', offsetPx: 0, maxHeightPx: 92 } as const;
    expect(sameToastStackPlacement(a, { ...a })).toBe(true);
    expect(sameToastStackPlacement(a, { ...a, offsetPx: 1 })).toBe(false);
    expect(sameToastStackPlacement(a, null)).toBe(false);
    expect(sameToastStackPlacement(null, null)).toBe(true);
  });
});

describe('open dialog registry', () => {
  it('reports the newest open dialog and notifies on each change', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeOpenDialogs(listener);
    // The registry only keeps the elements, so plain stand-ins will do.
    const first = {} as HTMLElement;
    const second = {} as HTMLElement;

    const removeFirst = registerOpenDialog(first);
    const removeSecond = registerOpenDialog(second);
    expect(getTopOpenDialog()).toBe(second);
    removeSecond();
    expect(getTopOpenDialog()).toBe(first);
    removeFirst();
    expect(getTopOpenDialog()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(4);

    unsubscribe();
    registerOpenDialog(first)();
    expect(listener).toHaveBeenCalledTimes(4);
  });
});
