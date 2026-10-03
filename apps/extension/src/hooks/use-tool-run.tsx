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

/** Shows a tool outcome as a toast; an undoable one keeps Undo for the deletion undo window. */
function notifyWithToast(outcome: ToolOutcome, onUndo?: () => void) {
  toast({
    title: outcome.title,
    description: outcome.description,
    variant: outcome.variant,
    ...(onUndo
      ? {
          duration: BOOKMARK_DELETION_UNDO_WINDOW_MS,
          action: <ToastAction onClick={onUndo}>{t('action_undo')}</ToastAction>,
        }
      : {}),
  });
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
      notify: notifyWithToast,
    }),
  );
  const state = useSyncExternalStore(run.subscribe, run.getState);
  return { state, run: run.run, apply: run.apply, undo: run.undo, close: run.close };
}
