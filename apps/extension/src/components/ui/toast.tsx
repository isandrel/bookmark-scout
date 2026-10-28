import { Toast as ToastPrimitives } from '@base-ui/react/toast';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import * as React from 'react';

const ToastProvider = ToastPrimitives.Provider;

type SwipeDirection = NonNullable<ToastPrimitives.Root.Props['swipeDirection']>;

/**
 * Where each Toast Position setting puts the stack (`viewport`), which edge a toast slides in
 * from and out to (`motion`), and which way it is swiped away: toward the nearer side, or toward
 * the edge for a centered stack.
 */
export const TOAST_POSITION_STYLES: Record<
  ToastPosition,
  { viewport: string; motion: string; swipe: SwipeDirection }
> = {
  'bottom-right': {
    viewport: 'bottom-0 right-0',
    motion: 'slide-in-from-bottom-full data-ending-style:slide-out-to-right-full',
    swipe: 'right',
  },
  'bottom-left': {
    viewport: 'bottom-0 left-0',
    motion: 'slide-in-from-bottom-full data-ending-style:slide-out-to-left-full',
    swipe: 'left',
  },
  'bottom-center': {
    viewport: 'bottom-0 left-1/2 -translate-x-1/2',
    motion: 'slide-in-from-bottom-full data-ending-style:slide-out-to-bottom-full',
    swipe: 'down',
  },
  'top-right': {
    viewport: 'top-0 right-0',
    motion: 'slide-in-from-top-full data-ending-style:slide-out-to-right-full',
    swipe: 'right',
  },
  'top-left': {
    viewport: 'top-0 left-0',
    motion: 'slide-in-from-top-full data-ending-style:slide-out-to-left-full',
    swipe: 'left',
  },
  'top-center': {
    viewport: 'top-0 left-1/2 -translate-x-1/2',
    motion: 'slide-in-from-top-full data-ending-style:slide-out-to-top-full',
    swipe: 'up',
  },
};

const ToastViewport = React.forwardRef<
  HTMLOListElement,
  Omit<ToastPrimitives.Viewport.Props, 'className'> & {
    className?: string;
    position?: ToastPosition;
    /** Where the stack keeps clear of an open dialog's footer (`useToastDialogClearance`). */
    clearance?: ToastStackPlacement | null;
  }
>(({ className, position = defaultSettings.toastPosition, clearance, ...props }, ref) => (
  <ToastPrimitives.Portal>
    <ToastPrimitives.Viewport
      ref={ref as React.Ref<HTMLDivElement>}
      render={<ol />}
      className={cn(
        // Capped at half the window and scrollable, so a stack of undo toasts never covers most of
        // a small popup. The viewport itself takes no clicks (each toast does): its padding, the
        // gaps between toasts, and the empty viewport would otherwise be a strip over the bottom
        // of every page that swallows clicks on what is under it. Empty, it has no size at all.
        // Next to an open dialog's footer, --toast-stack-room lowers the cap to the room it has.
        'pointer-events-none fixed z-[100] flex max-h-[min(50vh,var(--toast-stack-room,50vh))] w-full flex-col gap-2 overflow-y-auto overflow-x-hidden p-3 empty:p-0 md:max-w-[320px]',
        TOAST_POSITION_STYLES[position].viewport,
        className,
      )}
      data-position={position}
      style={
        clearance
          ? ({
              [clearance.edge]: `${clearance.offsetPx}px`,
              '--toast-stack-room': `${clearance.maxHeightPx}px`,
            } as React.CSSProperties)
          : undefined
      }
      {...props}
    />
  </ToastPrimitives.Portal>
));
ToastViewport.displayName = 'ToastViewport';

const toastVariants = cva(
  // Base UI moves a toast while it is swiped and resets it when a swipe is cancelled, so only the
  // release (ending) position needs a class. Where it slides in from and out to follows the Toast
  // Position setting (TOAST_POSITION_STYLES).
  'group pointer-events-auto relative flex w-full shrink-0 flex-col overflow-hidden rounded-lg border shadow-lg transition-all data-swiping:transition-none data-ending-style:data-[swipe-direction=left]:translate-x-[var(--toast-swipe-movement-x)] data-ending-style:data-[swipe-direction=right]:translate-x-[var(--toast-swipe-movement-x)] data-ending-style:data-[swipe-direction=up]:translate-y-[var(--toast-swipe-movement-y)] data-ending-style:data-[swipe-direction=down]:translate-y-[var(--toast-swipe-movement-y)] animate-in data-ending-style:animate-out data-ending-style:fade-out-80 duration-300 data-ending-style:duration-(--toast-exit-duration)',
  {
    variants: {
      variant: {
        default: 'border bg-popover text-popover-foreground',
        destructive: 'destructive group border-destructive/40 bg-destructive-wash text-foreground',
        success: 'border-success/40 bg-success-wash text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

// Closes the toast that renders it; see ToastAction.
const ToastCloseContext = React.createContext<() => void>(() => {});

const Toast = React.forwardRef<
  HTMLLIElement,
  Omit<ToastPrimitives.Root.Props, 'className'> &
    VariantProps<typeof toastVariants> & {
      className?: string;
      duration?: number;
      position?: ToastPosition;
    }
>(
  (
    {
      className,
      variant,
      duration = defaultSettings.toastDurationMs,
      position = defaultSettings.toastPosition,
      toast,
      ...props
    },
    ref,
  ) => {
    const { close } = ToastPrimitives.useToastManager();
    const closeToast = React.useCallback(() => close(toast.id), [close, toast.id]);
    return (
      <ToastCloseContext.Provider value={closeToast}>
        <ToastPrimitives.Root
          ref={ref as React.Ref<HTMLDivElement>}
          toast={toast}
          render={<li />}
          // Keeps Radix's semantics: a status entry inside the live region, not a dialog.
          role="status"
          aria-live="off"
          aria-atomic
          swipeDirection={TOAST_POSITION_STYLES[position].swipe}
          className={cn(
            toastVariants({ variant }),
            TOAST_POSITION_STYLES[position].motion,
            className,
          )}
          style={
            {
              '--toast-duration': `${duration}ms`,
              '--toast-exit-duration': `${TOAST_REMOVE_DELAY_MS}ms`,
            } as React.CSSProperties
          }
          {...props}
        />
      </ToastCloseContext.Provider>
    );
  },
);
Toast.displayName = 'Toast';

// Radix's action also dismissed its toast; Base UI's Toast.Action does not, so it closes the toast
// after the caller's onClick.
const ToastAction = React.forwardRef<
  HTMLButtonElement,
  Omit<ToastPrimitives.Action.Props, 'className'> & { className?: string }
>(({ className, onClick, ...props }, ref) => {
  const closeToast = React.useContext(ToastCloseContext);
  return (
    <ToastPrimitives.Action
      ref={ref}
      className={cn(
        'inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive',
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        closeToast();
      }}
      {...props}
    />
  );
});
ToastAction.displayName = 'ToastAction';

const ToastClose = React.forwardRef<
  HTMLButtonElement,
  Omit<ToastPrimitives.Close.Props, 'className'> & { className?: string }
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      'absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100',
      className,
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
));
ToastClose.displayName = 'ToastClose';

// Title and description keep Radix's <div>s instead of Base UI's default <h2> and <p>.
const ToastTitle = React.forwardRef<
  HTMLDivElement,
  Omit<ToastPrimitives.Title.Props, 'className'> & { className?: string }
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    render={<div />}
    className={cn('text-sm font-semibold [overflow-wrap:anywhere]', className)}
    {...props}
  />
));
ToastTitle.displayName = 'ToastTitle';

const ToastDescription = React.forwardRef<
  HTMLDivElement,
  Omit<ToastPrimitives.Description.Props, 'className'> & { className?: string }
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    render={<div />}
    data-slot="toast-description"
    className={cn('text-sm opacity-90 [overflow-wrap:anywhere]', className)}
    {...props}
  />
));
ToastDescription.displayName = 'ToastDescription';

// Progress bar that animates from 100% to 0% over the toast duration
const ToastProgress = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: 'default' | 'destructive' | 'success' | null;
    duration?: number;
  }
>(({ className, variant, duration = defaultSettings.toastDurationMs, ...props }, ref) => {
  const progressColors = {
    default: 'bg-primary/50',
    destructive: 'bg-destructive/50',
    success: 'bg-success/50',
  };

  return (
    <div className="w-full h-1 bg-muted overflow-hidden">
      <div
        ref={ref}
        className={cn(
          'h-full animate-toast-progress origin-left',
          progressColors[variant ?? 'default'],
          className,
        )}
        style={{ '--toast-duration': `${duration}ms` } as React.CSSProperties}
        {...props}
      />
    </div>
  );
});
ToastProgress.displayName = 'ToastProgress';

/** What `toast()` callers pass; the Toaster turns it into a Base UI toast. */
type ToastPropsExport = VariantProps<typeof toastVariants> & {
  className?: string;
  duration?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  Toast,
  ToastAction,
  type ToastActionElement,
  ToastClose,
  ToastDescription,
  ToastProgress,
  type ToastPropsExport as ToastProps,
  ToastProvider,
  ToastTitle,
  ToastViewport,
};
