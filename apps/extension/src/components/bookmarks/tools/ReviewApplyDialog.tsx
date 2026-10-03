/**
 * A review the user confirms before anything changes (dead-link repairs, import preview). It
 * owns the apply step: the outcome toast, keeping a partial outcome readable in the dialog, and
 * one undo shared by the toast and the dialog.
 */
import { useEffect, useState } from 'react';

/** What an apply did, as the caller reports it. */
export type ReviewApplyReport = ToolOutcome & {
  /** Close the dialog; otherwise it stays open showing `description` and `details`. */
  complete: boolean;
  /** Lines listed under the outcome while the dialog stays open. */
  details: Array<{ key: string; text: string }>;
};

type ReviewApplyDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  /** Width and layout classes for the dialog. */
  className: string;
  /** Applies the review; resolves with nothing when it stopped before changing anything. */
  onApply: () => Promise<ReviewApplyReport | undefined>;
  applyLabel: string;
  applyingLabel: string;
  canApply: boolean;
  /** Toast title when applying fails. */
  failureTitle: string;
  /** `data-testid` of the outcome shown after a partial apply. */
  outcomeTestId: string;
  /** Shown under the review while it is being reviewed, such as planned counts. */
  summary?: React.ReactNode;
  /** The review itself; replaced by the outcome after a partial apply. */
  children: (applying: boolean) => React.ReactNode;
};

export function ReviewApplyDialog({
  open,
  onClose,
  title,
  description,
  className,
  onApply,
  applyLabel,
  applyingLabel,
  canApply,
  failureTitle,
  outcomeTestId,
  summary,
  children,
}: ReviewApplyDialogProps) {
  const [applying, setApplying] = useState(false);
  const [outcome, setOutcome] = useState<ReviewApplyReport | null>(null);
  const [undoHandler, setUndoHandler] = useState<(() => void) | null>(null);

  // Every review starts fresh.
  useEffect(() => {
    if (!open) return;
    setOutcome(null);
    setUndoHandler(null);
  }, [open]);

  const reportFailure = (error: unknown) =>
    showToolOutcome({
      title: failureTitle,
      description: getErrorMessage(error),
      variant: 'destructive',
    });

  const handleApply = async () => {
    if (!canApply) return;
    setApplying(true);
    try {
      const report = await onApply();
      if (!report) return;
      const { undo } = report;
      // One undo per apply, whether triggered from the toast or the dialog.
      let undoUsed = false;
      const runUndo = undo
        ? () => {
            if (undoUsed) return;
            undoUsed = true;
            setUndoHandler(null);
            undo().then((reverted) => showToolOutcome(reverted), reportFailure);
          }
        : undefined;
      showToolOutcome(report, runUndo);
      if (report.complete) {
        onClose();
      } else {
        setOutcome(report);
        if (runUndo) setUndoHandler(() => runUndo);
      }
    } catch (error) {
      reportFailure(error);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !applying) onClose();
      }}
    >
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {outcome ? (
            <div
              role="alert"
              data-testid={outcomeTestId}
              className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm"
            >
              <p>{outcome.description}</p>
              <ul className="list-disc space-y-1 pl-5 text-xs">
                {outcome.details.map((detail) => (
                  <li key={detail.key} className="break-words">
                    {detail.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            children(applying)
          )}
        </div>

        {outcome ? null : summary}

        <DialogFooter className="gap-2">
          {outcome ? (
            <>
              {undoHandler ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    undoHandler();
                    onClose();
                  }}
                >
                  {t('action_undo')}
                </Button>
              ) : null}
              <Button onClick={onClose}>{t('action_close')}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={applying}>
                {t('action_cancel')}
              </Button>
              <Button onClick={handleApply} disabled={!canApply || applying}>
                {applying ? applyingLabel : applyLabel}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
