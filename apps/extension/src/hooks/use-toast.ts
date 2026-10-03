import * as React from 'react';

import type { ToastActionElement, ToastProps } from '@/components/ui/toast';

// Toasts with an action (Undo) are never dropped: each deletion must stay recoverable for its
// whole undo window, however many arrive at once. They leave only when their own timer ends or
// they are dismissed. An informational toast replaces the previous informational one. The
// Toaster keeps a long stack compact.
const TOAST_REMOVE_DELAY = 500;

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

const actionTypes = {
  ADD_TOAST: 'ADD_TOAST',
  UPDATE_TOAST: 'UPDATE_TOAST',
  DISMISS_TOAST: 'DISMISS_TOAST',
  REMOVE_TOAST: 'REMOVE_TOAST',
} as const;

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_VALUE;
  return count.toString();
}

type ActionType = typeof actionTypes;

type Action =
  | {
      type: ActionType['ADD_TOAST'];
      toast: ToasterToast;
    }
  | {
      type: ActionType['UPDATE_TOAST'];
      toast: Partial<ToasterToast>;
    }
  | {
      type: ActionType['DISMISS_TOAST'];
      toastId?: ToasterToast['id'];
    }
  | {
      type: ActionType['REMOVE_TOAST'];
      toastId?: ToasterToast['id'];
    };

interface State {
  toasts: ToasterToast[];
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      type: 'REMOVE_TOAST',
      toastId: toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'ADD_TOAST': {
      // Keep earlier toasts only while they still offer an action, newest first.
      const toasts = [
        action.toast,
        ...state.toasts.filter((toast) => toast.action && toast.open !== false),
      ];
      return { ...state, toasts };
    }

    case 'UPDATE_TOAST':
      return {
        ...state,
        toasts: state.toasts.map((t) => (t.id === action.toast.id ? { ...t, ...action.toast } : t)),
      };

    case 'DISMISS_TOAST': {
      const { toastId } = action;

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id);
        });
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t,
        ),
      };
    }
    case 'REMOVE_TOAST':
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
};

const listeners: Array<(state: State) => void> = [];

let memoryState: State = { toasts: [] };

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

type Toast = Omit<ToasterToast, 'id'>;

function toast({ ...props }: Toast) {
  const id = genId();

  const update = (props: ToasterToast) =>
    dispatch({
      type: 'UPDATE_TOAST',
      toast: { ...props, id },
    });
  const dismiss = () => dispatch({ type: 'DISMISS_TOAST', toastId: id });

  dispatch({
    type: 'ADD_TOAST',
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  return {
    id: id,
    dismiss,
    update,
  };
}

/** Glyph each outcome variant puts before a text title. */
const TOAST_TITLE_ICONS = { success: '✓', destructive: '×' } as const;

type OutcomeVariant = keyof typeof TOAST_TITLE_ICONS;

/** Toast options without the variant, which the helper sets. */
type OutcomeToast = Omit<Toast, 'variant'>;

function withTitleIcon(variant: OutcomeVariant, title: React.ReactNode): React.ReactNode {
  return typeof title === 'string' ? `${TOAST_TITLE_ICONS[variant]} ${title}` : title;
}

/** A success toast; a text title gets the ✓ glyph. */
toast.success = (props: OutcomeToast) =>
  toast({ ...props, title: withTitleIcon('success', props.title), variant: 'success' });

/** A failure toast; a text title gets the × glyph. */
toast.error = (props: OutcomeToast) =>
  toast({ ...props, title: withTitleIcon('destructive', props.title), variant: 'destructive' });

export type UndoToastOptions = {
  title: string;
  description?: React.ReactNode;
  /** Runs at most once, however often Undo is pressed; handle its errors inside. */
  onUndo: () => void | Promise<void>;
  /** `success` unless the change only partly worked. */
  variant?: OutcomeVariant;
  /** How long Undo is offered; the bookmark undo window unless the caller's window differs. */
  duration?: number;
};

/** An outcome toast with an Undo action that stays for the whole undo window. */
toast.withUndo = ({
  title,
  description,
  onUndo,
  variant = 'success',
  duration = BOOKMARK_DELETION_UNDO_WINDOW_MS,
}: UndoToastOptions) => {
  let undone = false;
  const action = React.createElement(
    ToastAction,
    {
      onClick: () => {
        // A snapshot restores at most once, so repeated clicks cannot duplicate the change.
        if (undone) return;
        undone = true;
        void onUndo();
      },
    },
    t('action_undo'),
  );
  return toast({
    title: withTitleIcon(variant, title),
    description,
    variant,
    duration,
    action: action as ToastActionElement,
  });
};

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: 'DISMISS_TOAST', toastId }),
  };
}

export { useToast, toast };
