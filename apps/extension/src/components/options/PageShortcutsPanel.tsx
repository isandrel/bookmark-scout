/**
 * Options > Behavior > Manager and popup shortcuts (`PageShortcutsPanel.lazy.tsx`), loaded when
 * the Behavior tab first shows it, so the recorder stays out of the code Options starts with.
 */
import { lazy, Suspense } from 'react';

const PageShortcutsPanelContent = lazy(() =>
  import('./PageShortcutsPanel.lazy').then((module) => ({
    default: module.PageShortcutsPanelContent,
  })),
);

export function PageShortcutsPanel() {
  return (
    <Suspense fallback={null}>
      <PageShortcutsPanelContent />
    </Suspense>
  );
}
