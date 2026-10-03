import type { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import type { ReactNode } from 'react';

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Label of the confirm button, such as "Delete". */
  confirmLabel: ReactNode;
  /** Runs when the user confirms; the dialog then closes. */
  onConfirm: () => void;
  /** `destructive` (default) for deletions, `default` for other confirmations. */
  variant?: 'destructive' | 'default';
  /** Classes for the dialog box, such as its width (`max-w-md` by default). */
  className?: string;
  /** Where focus goes on close; see Base UI's `Dialog.Popup` `finalFocus`. */
  finalFocus?: DialogPrimitive.Popup.Props['finalFocus'];
  /** Extra content between the description and the buttons. */
  children?: ReactNode;
};

/** Asks before an action: a title, an explanation, and Cancel next to the confirm button. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  variant = 'destructive',
  className = 'max-w-md',
  finalFocus,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={className} finalFocus={finalFocus}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('action_cancel')}
          </Button>
          <Button
            variant={variant}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
