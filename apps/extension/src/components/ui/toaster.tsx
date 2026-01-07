import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProgress,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  TOAST_DURATION,
} from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { useSettings } from '@/lib/settings-storage';

export function Toaster() {
  const { toasts } = useToast();
  const { settings } = useSettings();

  // Use settings value if available, otherwise fall back to default
  const toastDuration = settings?.toastDurationMs ?? TOAST_DURATION;

  return (
    <ToastProvider duration={toastDuration}>
      {toasts.map(({ id, title, description, action, variant, duration, ...props }) => (
        <Toast key={id} variant={variant} duration={duration ?? toastDuration} {...props}>
          <div className="p-4 pr-8">
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
          </div>
          <ToastProgress variant={variant} duration={duration ?? toastDuration} />
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
