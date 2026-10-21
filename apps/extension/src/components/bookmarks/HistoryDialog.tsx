/**
 * The manager's History (`HistoryDialog.lazy.tsx`), loaded the first time it opens, and the View
 * in History link results use to open it on their change.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import type { HistoryDialogProps } from './HistoryDialog.lazy';

const HistoryDialogContent = lazy(() =>
  import('./HistoryDialog.lazy').then((module) => ({ default: module.HistoryDialogContent })),
);

export function HistoryDialog(props: HistoryDialogProps) {
  const open = useAuditHistoryView((view) => view.open);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (open) setLoaded(true);
  }, [open]);
  // Once loaded it stays mounted, so closing animates out and reopening is instant.
  if (!loaded) return null;
  return (
    <Suspense fallback={null}>
      <HistoryDialogContent {...props} />
    </Suspense>
  );
}

/** Opens the manager's History on one record, from a result that names it. */
export function ViewInHistoryButton({ operationId }: { operationId: string }) {
  const openHistory = useAuditHistoryView((view) => view.openHistory);
  return (
    <button
      type="button"
      className="font-medium underline underline-offset-2"
      data-testid="view-in-history"
      onClick={() => openHistory(operationId)}
    >
      {t('history_viewInHistory')}
    </button>
  );
}

/**
 * A result's description with View in History after it, in the manager, where History is; the
 * description alone elsewhere or when no record was kept.
 */
export function withHistoryLink(description: string | undefined, operationId: string | undefined) {
  if (!operationId || currentAuditSource() !== 'manager') return description;
  return (
    <>
      {description} <ViewInHistoryButton operationId={operationId} />
    </>
  );
}
