import { Toast as ToastPrimitives } from '@base-ui/react/toast';
import { useEffect, useRef } from 'react';

type ToastData = Pick<ReturnType<typeof useToast>['toasts'][number], 'action' | 'variant'>;

// Base UI's toast viewport always uses F6 to move focus into the notifications.
const VIEWPORT_HOTKEY = 'F6';

export function Toaster() {
  const { settings } = useSettings();

  // Use settings value if available, otherwise fall back to default
  const toastDuration = settings?.toastDurationMs ?? TOAST_DURATION;

  // Undo toasts are never dropped, so the stack has no limit.
  return (
    <ToastProvider timeout={toastDuration} limit={Number.POSITIVE_INFINITY}>
      <ToastStack toastDuration={toastDuration} />
    </ToastProvider>
  );
}

function ToastStack({ toastDuration }: { toastDuration: number }) {
  const { toasts: requested } = useToast();
  const { toasts, add, close, update } = ToastPrimitives.useToastManager<ToastData>();
  const viewportRef = useRef<HTMLOListElement>(null);
  const shown = useRef(new Map<string, (typeof requested)[number]>());

  // `useToast` decides which toasts exist (undo toasts stay, an informational toast replaces the
  // previous one); Base UI runs their timers, pausing, and dismissal.
  useEffect(() => {
    const open = requested.filter((item) => item.open !== false);
    const openIds = new Set(open.map((item) => item.id));
    for (const id of [...shown.current.keys()]) {
      if (!openIds.has(id)) {
        shown.current.delete(id);
        close(id);
      }
    }
    // Oldest first, so the newest toast ends up at the front of Base UI's list.
    for (const item of [...open].reverse()) {
      const previous = shown.current.get(item.id);
      if (previous === item) continue;
      shown.current.set(item.id, item);
      const options = {
        title: item.title,
        description: item.description,
        timeout: item.duration,
        data: { action: item.action, variant: item.variant },
      };
      if (previous) {
        update(item.id, options);
      } else {
        add({
          id: item.id,
          ...options,
          onClose: () => {
            if (shown.current.delete(item.id)) item.onOpenChange?.(false);
          },
        });
      }
    }
  }, [requested, add, close, update]);

  // Toasts are shown oldest first; when the capped stack scrolls, keep the newest in view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs whenever the stack changes.
  useEffect(() => {
    // The viewport is portalled, so measure after the toasts have been laid out.
    const frame = requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [toasts.length]);

  const newestId = toasts.find((toast) => toast.transitionStatus !== 'ending')?.id;

  return (
    <ToastViewport
      ref={viewportRef}
      aria-label={t('toast_regionLabel').replace('{hotkey}', VIEWPORT_HOTKEY)}
    >
      {[...toasts].reverse().map((toast) => {
        const { action, variant } = toast.data ?? {};
        const duration = toast.timeout ?? toastDuration;
        // Undo toasts are never dropped, so a burst of deletions can stack many. Only the newest
        // is shown in full; older ones shrink to one line that keeps their own Undo and timer.
        const compact = toast.id !== newestId;
        return (
          <Toast
            key={toast.id}
            toast={toast}
            variant={variant}
            duration={duration}
            data-compact={compact ? '' : undefined}
          >
            {compact ? (
              <div className="flex items-center gap-2 py-1 pl-3 pr-8 [&>button]:h-7 [&>button]:px-2">
                <ToastDescription className="min-w-0 flex-1 truncate text-xs">
                  {toast.description ?? toast.title}
                </ToastDescription>
                {action}
              </div>
            ) : (
              <div className="p-4 pr-8">
                <div className="grid gap-1">
                  {toast.title && <ToastTitle>{toast.title}</ToastTitle>}
                  {toast.description && <ToastDescription>{toast.description}</ToastDescription>}
                </div>
                {action}
              </div>
            )}
            <ToastProgress variant={variant} duration={duration} />
            <ToastClose aria-label={t('action_close')} />
          </Toast>
        );
      })}
    </ToastViewport>
  );
}
