import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { reducer } from '@/hooks/use-toast';

type ToastState = ReturnType<typeof reducer>;

function add(state: ToastState, id: string, withAction: boolean): ToastState {
  return reducer(state, {
    type: 'ADD_TOAST',
    toast: {
      id,
      title: id,
      open: true,
      ...(withAction ? { action: createElement('span', null, 'Undo') as never } : {}),
    },
  });
}

describe('undo toast stack', () => {
  it('never drops an open undo toast, however many deletions arrive at once', () => {
    let state: ToastState = { toasts: [] };
    for (let index = 1; index <= 12; index += 1) state = add(state, `delete-${index}`, true);
    expect(state.toasts.map((toast) => toast.id)).toEqual(
      Array.from({ length: 12 }, (_, index) => `delete-${12 - index}`),
    );
  });

  it('keeps every undo toast when informational toasts arrive in between', () => {
    let state: ToastState = { toasts: [] };
    for (let index = 1; index <= 4; index += 1) {
      state = add(state, `delete-${index}`, true);
      state = add(state, `info-${index}`, false);
    }
    expect(state.toasts.map((toast) => toast.id)).toEqual([
      'info-4',
      'delete-4',
      'delete-3',
      'delete-2',
      'delete-1',
    ]);
  });

  it('removes an undo toast only once its own window closes', () => {
    let state: ToastState = { toasts: [] };
    for (let index = 1; index <= 4; index += 1) state = add(state, `delete-${index}`, true);
    state = reducer(state, { type: 'REMOVE_TOAST', toastId: 'delete-1' });
    expect(state.toasts.map((toast) => toast.id)).toEqual(['delete-4', 'delete-3', 'delete-2']);
  });
});
