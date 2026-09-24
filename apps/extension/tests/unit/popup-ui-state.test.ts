import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { reducer } from '@/hooks/use-toast';
import { clampPopupSize } from '@/hooks/use-popup-size';

type ToastInput = Parameters<typeof reducer>[1] extends infer A
  ? A extends { type: 'ADD_TOAST'; toast: infer T }
    ? T
    : never
  : never;

function add(state: ReturnType<typeof reducer>, id: string, withAction: boolean) {
  const toast: ToastInput = {
    id,
    title: id,
    ...(withAction ? { action: createElement('span', null, 'Undo') as never } : {}),
  };
  return reducer(state, { type: 'ADD_TOAST', toast });
}

describe('toast stacking', () => {
  it('keeps several undo toasts so each deletion stays recoverable', () => {
    let state = { toasts: [] as ReturnType<typeof reducer>['toasts'] };
    state = add(state, 'delete-1', true);
    state = add(state, 'delete-2', true);
    state = add(state, 'delete-3', true);
    expect(state.toasts.map((toast) => toast.id)).toEqual(['delete-3', 'delete-2', 'delete-1']);
  });

  it('replaces informational toasts but keeps undo toasts, up to the limit', () => {
    let state = { toasts: [] as ReturnType<typeof reducer>['toasts'] };
    state = add(state, 'delete-1', true);
    state = add(state, 'info-1', false);
    state = add(state, 'delete-2', true);
    state = add(state, 'info-2', false);
    expect(state.toasts.map((toast) => toast.id)).toEqual(['info-2', 'delete-2', 'delete-1']);
    state = add(state, 'delete-3', true);
    expect(state.toasts.map((toast) => toast.id)).toEqual(['delete-3', 'delete-2', 'delete-1']);
  });

  it('drops dismissed undo toasts when a new toast arrives', () => {
    let state = add({ toasts: [] }, 'delete-1', true);
    state = reducer(state, { type: 'DISMISS_TOAST', toastId: 'delete-1' });
    state = add(state, 'info-1', false);
    expect(state.toasts.map((toast) => toast.id)).toEqual(['info-1']);
  });
});

describe('clampPopupSize', () => {
  it('keeps popup dimensions within browser popup limits', () => {
    expect(clampPopupSize(500, 450)).toEqual({ width: 500, height: 450 });
    expect(clampPopupSize(1200, 1000)).toEqual({ width: 800, height: 600 });
    expect(clampPopupSize(100, 50)).toEqual({ width: 300, height: 300 });
    expect(clampPopupSize(Number.NaN, 420.6)).toEqual({ width: 300, height: 421 });
  });
});
