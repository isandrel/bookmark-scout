/**
 * Undo and redo for the manager page (Ctrl+Z, Ctrl+Y), with a toast that says what was undone or
 * redone, and what was left alone because the bookmarks changed since. The history itself is
 * `services/bookmark-history.ts`.
 */

import { useCallback, useRef } from 'react';

type HistoryStep = 'undo' | 'redo';

const STEP_MESSAGES = {
  undo: { done: 'toast_undone', none: 'toast_nothingToUndo', changed: 'toast_undoChanged' },
  redo: { done: 'toast_redone', none: 'toast_nothingToRedo', changed: 'toast_redoChanged' },
} as const satisfies Record<HistoryStep, Record<string, MessageKey>>;

/** Says in a toast how an undo or redo went. */
export function reportBookmarkHistoryOutcome(
  step: HistoryStep,
  outcome: BookmarkHistoryOutcome | null,
): void {
  const messages = STEP_MESSAGES[step];
  if (!outcome) {
    toast({ title: t(messages.none) });
    return;
  }
  if (outcome.applied === 0) {
    toast.error({ title: t(messages.changed) });
    return;
  }
  const details = [
    ...(outcome.skipped > 0 ? [t('toast_historySkipped', String(outcome.skipped))] : []),
    ...(outcome.metadataNotRestored
      ? [t('toast_metadataNotRestored', String(outcome.metadataNotRestored))]
      : []),
  ];
  // Bookmarks back without their tags are a partial restore, not a success.
  (outcome.metadataNotRestored ? toast.error : toast.success)({
    title: t(messages.done, describeBookmarkHistoryLabel(outcome.label)),
    ...(details.length > 0 ? { description: details.join(' ') } : {}),
  });
}

export function useBookmarkHistoryCommands() {
  // Steps run one after another, so Ctrl+Z and then Ctrl+Shift+Z pressed quickly both happen, in
  // that order. A held key repeats faster than a step finishes: a repeat is dropped while a step
  // runs, so letting go stops undoing.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const run = useCallback((step: HistoryStep, repeat = false) => {
    if (repeat && pending.current > 0) return;
    pending.current += 1;
    queue.current = queue.current.then(async () => {
      try {
        const outcome = step === 'undo' ? await undoBookmarkChange() : await redoBookmarkChange();
        reportBookmarkHistoryOutcome(step, outcome);
      } catch (error) {
        toast.error({ title: t('error_generic'), description: getErrorMessage(error) });
      } finally {
        pending.current -= 1;
      }
    });
  }, []);
  return {
    undo: useCallback((repeat?: boolean) => run('undo', repeat), [run]),
    redo: useCallback((repeat?: boolean) => run('redo', repeat), [run]),
  };
}
