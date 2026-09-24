import { useEffect, useRef } from 'react';

export function Toaster() {
  const { toasts } = useToast();
  const { settings } = useSettings();
  const viewportRef = useRef<HTMLOListElement>(null);

  // Toasts are appended oldest first; when the capped stack scrolls, keep the newest in view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs whenever the stack changes.
  useEffect(() => {
    // Radix portals each toast into the viewport, so measure after they have been laid out.
    const frame = requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [toasts.length]);

  // Use settings value if available, otherwise fall back to default
  const toastDuration = settings?.toastDurationMs ?? TOAST_DURATION;

  return (
    <ToastProvider duration={toastDuration} label={t('toast_itemLabel')}>
      {toasts.map(({ id, title, description, action, variant, duration, ...props }, index) => {
        // Undo toasts are never dropped, so a burst of deletions can stack many. Only the newest
        // is shown in full; older ones shrink to one line that keeps their own Undo and timer.
        const compact = index > 0;
        return (
          <Toast
            key={id}
            variant={variant}
            duration={duration ?? toastDuration}
            data-compact={compact ? '' : undefined}
            {...props}
          >
            {compact ? (
              <div className="flex items-center gap-2 py-1 pl-3 pr-8 [&>button]:h-7 [&>button]:px-2">
                <ToastDescription className="min-w-0 flex-1 truncate text-xs">
                  {description ?? title}
                </ToastDescription>
                {action}
              </div>
            ) : (
              <div className="p-4 pr-8">
                <div className="grid gap-1">
                  {title && <ToastTitle>{title}</ToastTitle>}
                  {description && <ToastDescription>{description}</ToastDescription>}
                </div>
                {action}
              </div>
            )}
            <ToastProgress variant={variant} duration={duration ?? toastDuration} />
            <ToastClose aria-label={t('action_close')} />
          </Toast>
        );
      })}
      {/* Radix replaces {hotkey} with the shortcut that focuses the notifications region. */}
      <ToastViewport ref={viewportRef} label={t('toast_regionLabel')} />
    </ToastProvider>
  );
}
