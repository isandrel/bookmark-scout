/**
 * The dead-link repair review (`DeadLinkRepairDialog.lazy.tsx`, with the shared `ReviewList`),
 * loaded the first time it opens, so the manager starts without it.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import type { DeadLinkRepairDialogProps } from './DeadLinkRepairDialog.lazy';

const DeadLinkRepairDialogContent = lazy(() =>
  import('./DeadLinkRepairDialog.lazy').then((module) => ({
    default: module.DeadLinkRepairDialogContent,
  })),
);

export function DeadLinkRepairDialog(props: DeadLinkRepairDialogProps) {
  const open = props.result !== null;
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (open) setLoaded(true);
  }, [open]);
  // Once loaded it stays mounted, so closing animates out and reopening is instant.
  if (!loaded) return null;
  return (
    <Suspense fallback={null}>
      <DeadLinkRepairDialogContent {...props} />
    </Suspense>
  );
}
