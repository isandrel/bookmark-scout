import { describe, expect, it, vi } from 'vitest';
import {
  type ClearanceRect,
  getTopDialogFooter,
  placeToastStackClearOf,
  registerDialogFooter,
  sameToastStackPlacement,
  subscribeDialogFooters,
} from '@/lib/toast-dialog-clearance';

// A 1100 x 1000 window with a wide restore dialog whose footer row runs from y 860 to 900, as in
// the screenshot that reported the bug.
const WINDOW_HEIGHT = 1000;
const FOOTER: ClearanceRect = { top: 860, bottom: 900, left: 240, right: 860 };
const RIGHT_STACK: ClearanceRect = { top: 0, bottom: 0, left: 780, right: 1100 };
const GAP = 8;

function place(
  position: ToastPosition,
  stackHeight: number,
  overrides: { stack?: ClearanceRect; footer?: ClearanceRect } = {},
) {
  return placeToastStackClearOf({
    position,
    windowHeight: WINDOW_HEIGHT,
    stack: overrides.stack ?? RIGHT_STACK,
    stackHeight,
    footer: overrides.footer ?? FOOTER,
    gapPx: GAP,
  });
}

describe('placeToastStackClearOf', () => {
  it('leaves a stack beside the footer alone', () => {
    expect(place('bottom-right', 200, { stack: { ...RIGHT_STACK, left: 860 } })).toBeNull();
    expect(
      place('bottom-left', 200, { stack: { top: 0, bottom: 0, left: 0, right: 240 } }),
    ).toBeNull();
  });

  it('keeps a bottom stack under the footer when it fits there', () => {
    // 1000 - 900 - 8 = 92 pixels below the footer.
    expect(place('bottom-right', 60)).toEqual({ edge: 'bottom', offsetPx: 0, maxHeightPx: 92 });
    expect(place('bottom-center', 92)).toEqual({ edge: 'bottom', offsetPx: 0, maxHeightPx: 92 });
  });

  it('lifts a bottom stack above the footer when it does not fit under it', () => {
    // The stack's bottom sits 8 pixels above the footer's top (1000 - 860 + 8 = 148).
    expect(place('bottom-right', 210)).toEqual({
      edge: 'bottom',
      offsetPx: 148,
      maxHeightPx: 852,
    });
  });

  it('keeps a top stack above the footer, capped to the room there', () => {
    expect(place('top-left', 210)).toEqual({ edge: 'top', offsetPx: 0, maxHeightPx: 852 });
  });

  it('moves a top stack under the footer when that side has more room', () => {
    // A short popup dialog whose footer is near the top: 52 pixels above it, 400 below.
    const footer = { top: 60, bottom: 92, left: 0, right: 1100 };
    expect(place('top-center', 120, { footer })).toEqual({
      edge: 'top',
      offsetPx: 100,
      maxHeightPx: 900,
    });
  });

  it('stays on its own edge when neither side fits and its own side has more room', () => {
    const footer = { top: 400, bottom: 440, left: 0, right: 1100 };
    expect(place('bottom-right', 2000, { footer })).toEqual({
      edge: 'bottom',
      offsetPx: 0,
      maxHeightPx: 552,
    });
  });

  it('never gives a negative room', () => {
    const footer = { top: 0, bottom: 1000, left: 0, right: 1100 };
    expect(place('bottom-right', 100, { footer })).toEqual({
      edge: 'bottom',
      offsetPx: 0,
      maxHeightPx: 0,
    });
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

describe('dialog footer registry', () => {
  it('reports the newest open footer and notifies on each change', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDialogFooters(listener);
    // The registry only keeps the elements, so plain stand-ins will do.
    const first = {} as HTMLElement;
    const second = {} as HTMLElement;

    const removeFirst = registerDialogFooter(first);
    const removeSecond = registerDialogFooter(second);
    expect(getTopDialogFooter()).toBe(second);
    removeSecond();
    expect(getTopDialogFooter()).toBe(first);
    removeFirst();
    expect(getTopDialogFooter()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(4);

    unsubscribe();
    registerDialogFooter(first)();
    expect(listener).toHaveBeenCalledTimes(4);
  });
});
