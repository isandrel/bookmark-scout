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
  /** A partial apply's outcome, shown above the review; `canUndo` while undo is offered. */
  notice: { message: string; notes: string[]; canUndo: boolean } | null;
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
  /** Shows an outcome; `undo` is set while the outcome can be reverted. */
  notify(outcome: ToolOutcome, undo?: UndoOffer): void;
};

/**
 * One undo offered from a toast and a dialog at once. It reverts at most once and never after
 * `expiresAt`; when it is used or expires, every place that offers it hides its Undo.
 */
export type UndoOffer = {
  /** Epoch milliseconds after which Undo is no longer offered. */
  expiresAt: number;
  /** Reverts once, unless the offer already ended; resolves when the revert finished. */
  run(): Promise<void>;
  /** The toast offering this undo; it closes when the offer ends. */
  attach(toast: { dismiss(): void }): void;
};

/** Why an undo offer ended: Undo was pressed, or its window passed. */
export type UndoOfferEnd = 'used' | 'expired';

/**
 * Creates the undo a toast and a dialog share. `expiresAt` defaults to the bookmark undo window
 * from now, the time the undo toast stays open.
 */
export function createUndoOffer({
  revert,
  expiresAt = Date.now() + BOOKMARK_DELETION_UNDO_WINDOW_MS,
  onEnd,
}: {
  /** Handles its own errors. */
  revert: () => Promise<void>;
  expiresAt?: number;
  onEnd?: (reason: UndoOfferEnd) => void;
}): UndoOffer {
  let ended = false;
  let undoToast: { dismiss(): void } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const end = (reason: UndoOfferEnd) => {
    if (ended) return;
    ended = true;
    clearTimeout(timer);
    undoToast?.dismiss();
    onEnd?.(reason);
  };
  timer = setTimeout(() => end('expired'), Math.max(0, expiresAt - Date.now()));
  return {
    expiresAt,
    async run() {
      if (ended) return;
      // A timer can fire late in a background tab, so the clock decides.
      if (Date.now() > expiresAt) {
        end('expired');
        return;
      }
      end('used');
      await revert();
    },
    attach(next) {
      undoToast = next;
      if (ended) next.dismiss();
    },
  };
}

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
  let pendingUndo: UndoOffer | null = null;
  const listeners = new Set<() => void>();

  const update = (changes: Partial<ToolRunState<Result>>) => {
    state = { ...state, ...changes };
    for (const listener of listeners) listener();
  };

  const reportFailure = (titleKey: string, description: string) =>
    deps.notify({ title: t(titleKey), description, variant: 'destructive' });

  /** A failed scan as the user reads it: an AI tool's scan is an AI request. */
  const describeScanError = (error: unknown) =>
    tool.requiresAI ? describeAIError(error) : getErrorMessage(error, tool.scanFailureKey);

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
          {
            ...request,
            onError: (error) => reportFailure('toast_toolFailed', getErrorMessage(error)),
          },
          write,
        ),
      notify: (outcome) => deps.notify(outcome),
    };
  };

  const rescan = async () => tool.scan(context(await deps.freshNodes(scope)));
  /** The result to review after a change: rescanned, or kept when the tool says so. */
  const resultAfterChange = async (current: Result) =>
    tool.keepResultAfterApply ? current : rescan();

  /** Wraps an outcome's undo so the review and the toast share one revert until it expires. */
  const offerUndo = (revert: () => Promise<ToolOutcome>, expiresAt?: number) => {
    const offer = createUndoOffer({
      expiresAt,
      revert: async () => {
        try {
          const outcome = await revert();
          if (tool.changesBookmarks) await deps.refresh();
          const { open, phase, result } = state;
          if (open && phase === 'review' && result !== null) {
            update({ result: await resultAfterChange(result) });
          }
          deps.notify(outcome);
        } catch (error) {
          reportFailure('toast_toolFailed', getErrorMessage(error));
        }
      },
      onEnd: (reason) => {
        if (pendingUndo !== offer) return;
        pendingUndo = null;
        // An expired undo leaves the outcome readable without its Undo.
        update({
          notice: reason === 'used' || !state.notice ? null : { ...state.notice, canUndo: false },
        });
      },
    });
    pendingUndo = offer;
    return offer;
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
    const undo = outcome.undo ? offerUndo(outcome.undo, outcome.undoExpiresAt) : undefined;
    if (outcome.keepOpen && state.open) {
      update({
        phase: 'review',
        result: await resultAfterChange(result),
        notice: {
          message: outcome.description ?? outcome.title,
          notes: outcome.notes ?? [],
          canUndo: Boolean(undo),
        },
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
    reportFailure(tool.applyFailureTitleKey ?? 'toast_toolFailed', getErrorMessage(error));
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
            errors: [describeScanError(error)],
          });
        } else {
          update({ phase: 'idle' });
          reportFailure('toast_toolFailed', describeScanError(error));
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
      await pendingUndo?.run();
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
