/**
 * One controller for every tool in `TOOL_DEFINITIONS`: scan a scope, show the review, apply what
 * the user confirmed, and offer a single undo. It holds no React state, so it is tested with
 * injected bookmarks, network, and AI fakes, and `useToolRun` only subscribes to it.
 */
import type { BookmarkTreeNode } from '@/types';

export type ToolRunPhase = 'idle' | 'scanning' | 'review' | 'applying' | 'done';

export type ToolRunState<Result> = {
  /** The work in progress; `scanning` also covers a tool that applies right after its scan. */
  phase: ToolRunPhase;
  /** Whether the review shows. Closing it never cancels a scan or an apply in flight. */
  open: boolean;
  /** The scan under review. */
  result: Result | null;
  /** Problems shown inside the review (reorganization). */
  errors: string[];
  /** A partial apply's outcome, shown above the rescanned review while undo is offered. */
  notice: { message: string; canUndo: boolean } | null;
};

/** What a run needs from the page; tests pass fakes. */
export type ToolRunDeps = {
  /** The settings at the moment of the call. */
  settings(): Settings;
  /** Bookmarks in a scope, from the page's tree. */
  nodes(scope: BookmarkToolScope): BookmarkTreeNode[];
  /** Bookmarks in a scope, read again from the browser after a change. */
  freshNodes(scope: BookmarkToolScope): Promise<BookmarkTreeNode[]>;
  /** Reloads the page's tree after bookmarks changed. */
  refresh(): Promise<void>;
  /** The default AI service, read only after the AI-enabled check passed. */
  aiSettings(): Promise<AISettings>;
  saveFile(
    request: ToolFileRequest & { onError(error: unknown): void },
    write: (nodes: BookmarkTreeNode[]) => void,
  ): void;
  /** Shows an outcome; `onUndo` is set while the outcome can be reverted. */
  notify(outcome: ToolOutcome, onUndo?: () => void): void;
};

export type ToolRun<Result, Selection> = {
  getState(): ToolRunState<Result>;
  subscribe(listener: () => void): () => void;
  /** Scans the scope, then opens the review or, for an auto-apply tool, applies. */
  run(scope: BookmarkToolScope): Promise<void>;
  /** Applies the reviewed result. */
  apply(selection: Selection): Promise<void>;
  /** Reverts the last apply, at most once, from the review or the toast. */
  undo(): Promise<void>;
  /** Closes the review. */
  close(): void;
};

const IDLE: ToolRunState<never> = {
  phase: 'idle',
  open: false,
  result: null,
  errors: [],
  notice: null,
};

export function createToolRun<Result, Selection>(
  tool: ToolDefinition<Result, Selection>,
  deps: ToolRunDeps,
): ToolRun<Result, Selection> {
  let state: ToolRunState<Result> = IDLE;
  let scope: BookmarkToolScope = 'all';
  let pendingUndo: (() => Promise<void>) | null = null;
  const listeners = new Set<() => void>();

  const update = (changes: Partial<ToolRunState<Result>>) => {
    state = { ...state, ...changes };
    for (const listener of listeners) listener();
  };

  const reportFailure = (error: unknown, titleKey: string, fallbackKey?: string) =>
    deps.notify({
      title: t(titleKey),
      description: getErrorMessage(error, fallbackKey),
      variant: 'destructive',
    });

  const context = (nodes: BookmarkTreeNode[]): ToolContext => {
    const settings = deps.settings();
    return {
      settings,
      options: getToolOptions(settings),
      scope,
      nodes,
      // The enabled check comes first so a disabled AI never surfaces provider or key errors.
      aiSettings: async () => {
        if (!settings.aiEnabled) throw new Error(t('ai_featuresDisabled'));
        return deps.aiSettings();
      },
      saveFile: (request, write) =>
        deps.saveFile(
          { ...request, onError: (error) => reportFailure(error, 'toast_toolFailed') },
          write,
        ),
      notify: (outcome) => deps.notify(outcome),
    };
  };

  const rescan = async () => tool.scan(context(await deps.freshNodes(scope)));

  /** Wraps an outcome's undo so the review and the toast share one revert. */
  const offerUndo = (revert: () => Promise<ToolOutcome>) => {
    let used = false;
    const undoOnce = async () => {
      if (used) return;
      used = true;
      if (pendingUndo === undoOnce) {
        pendingUndo = null;
        update({ notice: null });
      }
      try {
        const outcome = await revert();
        if (tool.changesBookmarks) await deps.refresh();
        if (state.open && state.phase === 'review') update({ result: await rescan() });
        deps.notify(outcome);
      } catch (error) {
        reportFailure(error, 'toast_toolFailed');
      }
    };
    pendingUndo = undoOnce;
    return undoOnce;
  };

  const applyResult = async (result: Result, selection: Selection, reviewed: boolean) => {
    if (!tool.apply) return;
    const outcome = await tool.apply(result, selection, {
      ...context(deps.nodes(scope)),
      reviewed,
    });
    if (tool.changesBookmarks) await deps.refresh();
    if (!outcome) {
      update({ phase: 'done', open: false, result: null });
      return;
    }
    if (outcome.errors?.length) {
      update({ phase: state.open ? 'review' : 'idle', result, errors: outcome.errors });
      return;
    }
    const undo = outcome.undo ? offerUndo(outcome.undo) : undefined;
    if (outcome.keepOpen && state.open) {
      update({
        phase: 'review',
        result: await rescan(),
        notice: { message: outcome.description ?? outcome.title, canUndo: Boolean(undo) },
      });
    } else {
      update({ phase: 'done', open: false, result: null, notice: null });
    }
    deps.notify(outcome, undo);
  };

  const applyFailed = (error: unknown) => {
    if (tool.reviewWhileScanning) {
      update({
        phase: state.open ? 'review' : 'idle',
        errors: [getErrorMessage(error, tool.scanFailureKey)],
      });
      return;
    }
    update({ phase: state.open ? 'review' : 'idle' });
    reportFailure(error, tool.applyFailureTitleKey ?? 'toast_toolFailed');
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async run(nextScope) {
      scope = nextScope;
      pendingUndo = null;
      update({ ...IDLE, phase: 'scanning', open: Boolean(tool.reviewWhileScanning) });
      let result: Result;
      try {
        result = await tool.scan(context(deps.nodes(scope)));
      } catch (error) {
        if (tool.reviewWhileScanning) {
          update({
            phase: state.open ? 'review' : 'idle',
            errors: [getErrorMessage(error, tool.scanFailureKey)],
          });
        } else {
          update({ phase: 'idle' });
          reportFailure(error, 'toast_toolFailed', tool.scanFailureKey);
        }
        return;
      }
      if (tool.apply && tool.autoApply?.(deps.settings())) {
        update({ result });
        try {
          await applyResult(result, undefined as Selection, false);
        } catch (error) {
          applyFailed(error);
        }
        return;
      }
      // A review closed while scanning stays closed.
      const closed = tool.reviewWhileScanning && !state.open;
      update({ phase: closed ? 'idle' : 'review', open: !closed, result });
    },
    async apply(selection) {
      const { result } = state;
      if (state.phase !== 'review' || result === null) return;
      update({ phase: 'applying', errors: [] });
      try {
        await applyResult(result, selection, true);
      } catch (error) {
        applyFailed(error);
      }
    },
    async undo() {
      await pendingUndo?.();
    },
    close() {
      update({
        open: false,
        notice: null,
        ...(state.phase === 'review' ? { phase: 'idle' as const } : {}),
      });
    },
  };
}
