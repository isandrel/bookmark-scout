import { createElement, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { setLanguage } from '@/hooks/use-i18n';
import { reducer, toast, useToast } from '@/hooks/use-toast';
import { BOOKMARK_DELETION_UNDO_WINDOW_MS } from '@/services/bookmarks';
import { readHook } from './read-hook';

/** The toasts as a component sees them right now. */
function currentToasts() {
  return readHook(useToast).toasts;
}

describe('toast helpers', () => {
  it('draws the outcome glyph from the variant', () => {
    toast.success({ title: 'Saved' });
    expect(currentToasts()[0]).toMatchObject({ title: '✓ Saved', variant: 'success' });
    toast.error({ title: 'Failed', description: 'Disk full' });
    expect(currentToasts()[0]).toMatchObject({
      title: '× Failed',
      description: 'Disk full',
      variant: 'destructive',
    });
  });

  it('keeps the plain toast() call working unchanged', () => {
    toast({ title: 'Plain', variant: 'success' });
    expect(currentToasts()[0]).toMatchObject({ title: 'Plain', variant: 'success' });
  });

  it('offers Undo once, for the bookmark undo window', () => {
    setLanguage('en');
    const onUndo = vi.fn();
    toast.withUndo({ title: 'Bookmark deleted', description: 'Undo within 10 seconds.', onUndo });
    const [shown] = currentToasts();
    expect(shown).toMatchObject({
      title: '✓ Bookmark deleted',
      variant: 'success',
      duration: BOOKMARK_DELETION_UNDO_WINDOW_MS,
    });
    const action = shown.action as ReactElement<{ onClick: () => void; children: string }>;
    expect(action.props.children).toBe('Undo');
    action.props.onClick();
    action.props.onClick();
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});

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

describe('toast position', () => {
  it('places and moves toasts for every Toast Position choice, swiped toward their side', async () => {
    const { TOAST_POSITION_STYLES } = await import('@/components/ui/toast');
    const { getSettingsFieldMeta, defaultSettings } = await import('@/lib/settings-schema');
    const choices = getSettingsFieldMeta().toastPosition.options?.map((option) => option.value);
    expect(choices).toEqual(Object.keys(TOAST_POSITION_STYLES));
    expect(defaultSettings.toastPosition).toBe('bottom-right');
    for (const [position, style] of Object.entries(TOAST_POSITION_STYLES)) {
      const [edge, side] = position.split('-');
      expect(style.viewport, position).toContain(`${edge}-0`);
      expect(style.motion, position).toContain(`slide-in-from-${edge}-full`);
      const away = side === 'center' ? { top: 'up', bottom: 'down' }[edge] : side;
      expect(style.swipe, position).toBe(away);
    }
  });
});
