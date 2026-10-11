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
  toast.success({
    title: t(messages.done, describeBookmarkHistoryLabel(outcome.label)),
    ...(outcome.skipped > 0
      ? { description: t('toast_historySkipped', String(outcome.skipped)) }
      : {}),
  });
}

export function useBookmarkHistoryCommands() {
  // One step at a time: a held Ctrl+Z repeats the key faster than a step finishes.
  const running = useRef(false);
  const run = useCallback(async (step: HistoryStep) => {
    if (running.current) return;
    running.current = true;
    try {
      const outcome = step === 'undo' ? await undoBookmarkChange() : await redoBookmarkChange();
      reportBookmarkHistoryOutcome(step, outcome);
    } catch (error) {
      toast.error({ title: t('error_generic'), description: getErrorMessage(error) });
    } finally {
      running.current = false;
    }
  }, []);
  return {
    undo: useCallback(() => void run('undo'), [run]),
    redo: useCallback(() => void run('redo'), [run]),
  };
}
