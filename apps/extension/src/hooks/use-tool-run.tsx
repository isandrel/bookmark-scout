import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { BookmarkTreeNode } from '@/types';

/** What the Tools sidebar shares with every tool run. */
export type ToolEnvironment = {
  settings: Settings;
  /** The page's bookmark tree. */
  folders: BookmarkTreeNode[];
  currentFolderId: string | null;
  refresh(): Promise<void>;
  /** `useExportPrivacyReview().reviewBeforeExport`. */
  saveFile: ToolRunDeps['saveFile'];
};

/**
 * Shows a tool outcome as a toast with the ✓ or × mark of its variant. An undoable one keeps
 * Undo until the offer ends: used here or in the review, or expired.
 */
export function showToolOutcome(outcome: ToolOutcome, undo?: UndoOffer) {
  const { title, description, variant } = outcome;
  if (undo) {
    undo.attach(
      toast.withUndo({
        title,
        description,
        variant: variant ?? 'success',
        onUndo: undo.run,
        duration: Math.max(0, undo.expiresAt - Date.now()),
      }),
    );
  } else if (variant === 'success') {
    toast.success({ title, description });
  } else if (variant === 'destructive') {
    toast.error({ title, description });
  } else {
    toast({ title, description });
  }
}

/** Runs one tool for a component: the controller from `createToolRun` and its live state. */
export function useToolRun<Result, Selection>(
  tool: ToolDefinition<Result, Selection>,
  environment: ToolEnvironment,
) {
  const environmentRef = useRef(environment);
  useLayoutEffect(() => {
    environmentRef.current = environment;
  });
  const [run] = useState(() =>
    createToolRun(tool, {
      settings: () => environmentRef.current.settings,
      nodes: (scope) => {
        const { folders, currentFolderId } = environmentRef.current;
        return getScopedNodes(folders, currentFolderId, scope);
      },
      freshNodes: async (scope) =>
        getScopedNodes(await fetchBookmarkTree(), environmentRef.current.currentFolderId, scope),
      refresh: () => environmentRef.current.refresh(),
      aiSettings: () => getActiveAISettings(true),
      saveFile: (request, write) => environmentRef.current.saveFile(request, write),
      notify: showToolOutcome,
    }),
  );
  const state = useSyncExternalStore(run.subscribe, run.getState);
  return { state, run: run.run, apply: run.apply, undo: run.undo, close: run.close };
}
