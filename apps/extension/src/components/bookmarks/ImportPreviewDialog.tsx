/**
 * Import preview (dry run): shows the exact target folder, planned counts, and duplicates before
 * anything is written, then applies the plan and reports created / skipped / failed items.
 */

import { useEffect, useMemo, useState } from 'react';
import type { BookmarkTreeNode } from '@/types';

/** Conflicts listed in the preview; the rest are summarized as a count. */
const MAX_LISTED_CONFLICTS = 50;
/** Distinct browser error messages shown after a partial import. */
const MAX_LISTED_ERRORS = 5;

export type ImportPreviewSource = { fileName: string; parsed: ImportResult };

type ImportPreviewDialogProps = {
  /** The parsed file to preview; the dialog is open while this is set. */
  source: ImportPreviewSource | null;
  /** Folder preselected as the target when it can receive the import. */
  defaultTargetId: string | null;
  onClose: () => void;
  /** Called after items were created or removed, to refresh views of the tree. */
  onChanged: () => Promise<void> | void;
};

const STRATEGY_LABEL_KEYS = {
  'skip-anywhere': 'tools_importStrategySkipAnywhere',
  'skip-in-target': 'tools_importStrategySkipInTarget',
  'import-all': 'tools_importStrategyImportAll',
} as const satisfies Record<ImportDuplicateStrategy, string>;

const CONFLICT_LABEL_KEYS = {
  'in-target': 'tools_importConflictInTarget',
  elsewhere: 'tools_importConflictElsewhere',
  'in-file': 'tools_importConflictInFile',
} as const satisfies Record<ImportConflictKind, string>;

function describeOutcome(outcome: ImportApplyOutcome): string {
  return t('tools_importOutcome', [
    String(outcome.bookmarksCreated),
    String(outcome.foldersCreated),
    String(outcome.skipped),
    String(outcome.failed),
  ]);
}

export function ImportPreviewDialog({
  source,
  defaultTargetId,
  onClose,
  onChanged,
}: ImportPreviewDialogProps) {
  const { toast } = useToast();
  const [tree, setTree] = useState<BookmarkTreeNode[] | null>(null);
  const [targetId, setTargetId] = useState('');
  const [strategy, setStrategy] = useState<ImportDuplicateStrategy>('skip-anywhere');
  const [notice, setNotice] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ImportApplyOutcome | null>(null);
  const [undoHandler, setUndoHandler] = useState<(() => void) | null>(null);

  // Each new file starts from a fresh read of the tree and the default target.
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    setTree(null);
    setNotice(null);
    setResult(null);
    setUndoHandler(null);
    setStrategy('skip-anywhere');
    fetchBookmarkTree()
      .then((fresh) => {
        if (cancelled) return;
        const targets = listImportTargets(fresh);
        setTree(fresh);
        setTargetId(
          targets.find((target) => target.id === defaultTargetId)?.id ?? targets[0]?.id ?? '',
        );
      })
      .catch((error: unknown) => {
        if (!cancelled) setNotice(error instanceof Error ? error.message : t('error_unknown'));
      });
    return () => {
      cancelled = true;
    };
  }, [source, defaultTargetId]);

  const targets = useMemo(() => (tree ? listImportTargets(tree) : []), [tree]);
  const planned = useMemo(() => {
    if (!source || !tree || !targetId) return null;
    try {
      return { plan: planImport(source.parsed, tree, targetId, strategy), error: null };
    } catch (error) {
      return { plan: null, error: error instanceof Error ? error.message : t('error_unknown') };
    }
  }, [source, tree, targetId, strategy]);
  const plan = planned?.plan ?? null;
  const targetLabel = targets.find((target) => target.id === targetId)?.label ?? '';
  const plannedItems = plan ? plan.counts.bookmarksToCreate + plan.counts.foldersToCreate : 0;

  const undo = async (outcome: ImportApplyOutcome) => {
    const { removed, failed } = await undoImport(outcome);
    await onChanged();
    toast({
      title: failed ? t('tools_importUndoPartial') : t('tools_importUndone'),
      description: t('tools_importUndoneDesc', [String(removed), String(failed)]),
      variant: failed ? 'destructive' : 'success',
    });
  };

  const handleApply = async () => {
    if (!source || !plan) return;
    setApplying(true);
    setNotice(null);
    try {
      // Re-plan against the live tree so the import never applies a stale preview.
      const fresh = await fetchBookmarkTree();
      let freshPlan: ImportPlan;
      try {
        freshPlan = planImport(source.parsed, fresh, plan.targetFolderId, plan.strategy);
      } catch (error) {
        setTree(fresh);
        setNotice(error instanceof Error ? error.message : t('error_unknown'));
        return;
      }
      if (!isSameImportPlan(plan, freshPlan)) {
        setTree(fresh);
        setNotice(t('tools_importPreviewChanged'));
        return;
      }

      const outcome = await applyImportPlan(freshPlan);
      await onChanged();
      const created = outcome.bookmarksCreated + outcome.foldersCreated;
      // One undo per import, whether triggered from the toast or the dialog.
      let undoUsed = false;
      const runUndo = () => {
        if (undoUsed) return;
        undoUsed = true;
        setUndoHandler(null);
        void undo(outcome);
      };
      toast({
        title:
          outcome.failed === 0
            ? t('toast_importSuccess')
            : created === 0
              ? t('toast_importFailed')
              : t('toast_importPartial'),
        description: describeOutcome(outcome),
        variant: outcome.failed === 0 ? 'success' : 'destructive',
        duration: BOOKMARK_DELETION_UNDO_WINDOW_MS,
        action:
          outcome.createdRootIds.length > 0 ? (
            <ToastAction onClick={runUndo}>
              {t('action_undo')}
            </ToastAction>
          ) : undefined,
      });
      if (outcome.failed === 0) {
        onClose();
      } else {
        // Keep the dialog open so the failures stay readable next to the counts.
        setResult(outcome);
        setUndoHandler(() => runUndo);
      }
    } catch (error) {
      toast({
        title: t('toast_importFailed'),
        description: error instanceof Error ? error.message : t('error_unknown'),
        variant: 'destructive',
      });
    } finally {
      setApplying(false);
    }
  };

  const conflicts = plan?.conflicts ?? [];
  const summaryLines = plan
    ? [
        t('tools_importPreviewBookmarks', String(plan.counts.bookmarksToCreate)),
        t('tools_importPreviewFolders', String(plan.counts.foldersToCreate)),
        t(
          'tools_importPreviewSkipped',
          String(plan.counts.bookmarksToSkip + plan.counts.foldersToSkip),
        ),
        ...(plan.counts.invalid > 0
          ? [t('tools_importPreviewInvalid', String(plan.counts.invalid))]
          : []),
      ]
    : [];

  return (
    <Dialog
      open={source !== null}
      onOpenChange={(open) => {
        if (!open && !applying) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('tools_importPreviewTitle')}</DialogTitle>
          <DialogDescription>
            {t('tools_importPreviewDesc', source?.fileName ?? '')}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {result ? (
            <div
              role="alert"
              data-testid="import-result"
              className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm"
            >
              <p>{describeOutcome(result)}</p>
              <ul className="list-disc space-y-1 pl-5 text-xs">
                {[...new Set(result.errors)].slice(0, MAX_LISTED_ERRORS).map((error) => (
                  <li key={error} className="break-words">
                    {error}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('tools_importTarget')}
                  </span>
                  <Select
                    // An empty id means nothing is chosen yet, so the placeholder shows.
                    value={targetId || null}
                    onValueChange={(value) => setTargetId(value ?? '')}
                    items={targets.map((target) => ({ value: target.id, label: target.label }))}
                    disabled={applying}
                  >
                    <SelectTrigger aria-label={t('tools_importTarget')}>
                      <SelectValue placeholder={t('tools_importTarget')} />
                    </SelectTrigger>
                    <SelectContent>
                      {targets.map((target) => (
                        <SelectItem key={target.id} value={target.id}>
                          {target.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('tools_importStrategy')}
                  </span>
                  <Select
                    value={strategy}
                    onValueChange={(value) => {
                      if (value !== null) setStrategy(value as ImportDuplicateStrategy);
                    }}
                    items={IMPORT_DUPLICATE_STRATEGIES.map((option) => ({
                      value: option,
                      label: t(STRATEGY_LABEL_KEYS[option]),
                    }))}
                    disabled={applying}
                  >
                    <SelectTrigger aria-label={t('tools_importStrategy')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {IMPORT_DUPLICATE_STRATEGIES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {t(STRATEGY_LABEL_KEYS[option])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {notice || planned?.error ? (
                <div
                  role="alert"
                  className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200"
                >
                  {notice ?? planned?.error}
                </div>
              ) : null}

              {plan ? (
                <div
                  data-testid="import-preview-summary"
                  className="space-y-1 rounded-lg border p-3 text-sm"
                >
                  <p className="font-medium">{t('tools_importPreviewTargetLine', targetLabel)}</p>
                  {summaryLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                  {plannedItems === 0 ? (
                    <p className="text-muted-foreground">{t('tools_importNothingToCreate')}</p>
                  ) : null}
                </div>
              ) : null}

              {plan && conflicts.length > 0 ? (
                <div className="space-y-2" data-testid="import-preview-conflicts">
                  <p className="text-sm font-medium">
                    {t('tools_importPreviewConflicts', [
                      String(plan.counts.duplicatesInTarget),
                      String(plan.counts.duplicatesElsewhere),
                      String(plan.counts.duplicatesInFile),
                    ])}
                  </p>
                  <ul className="space-y-2">
                    {conflicts.slice(0, MAX_LISTED_CONFLICTS).map((conflict, index) => (
                      <li
                        // Titles and URLs can repeat, so the position disambiguates.
                        key={`${conflict.url}-${index}`}
                        className="rounded-md bg-muted/40 p-2 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            {conflict.title || t('bookmarks_untitled')}
                          </span>
                          <Badge variant="outline">{t(CONFLICT_LABEL_KEYS[conflict.kind])}</Badge>
                          <Badge variant={conflict.skipped ? 'secondary' : 'default'}>
                            {conflict.skipped
                              ? t('tools_importWillSkip')
                              : t('tools_importWillImport')}
                          </Badge>
                        </div>
                        <p className="break-all text-xs text-muted-foreground">{conflict.url}</p>
                      </li>
                    ))}
                  </ul>
                  {conflicts.length > MAX_LISTED_CONFLICTS ? (
                    <p className="text-xs text-muted-foreground">
                      {t(
                        'bookmarks_bulkPreviewMore',
                        String(conflicts.length - MAX_LISTED_CONFLICTS),
                      )}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          {result ? (
            <>
              {undoHandler && result.createdRootIds.length > 0 ? (
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
              <Button onClick={handleApply} disabled={!plan || plannedItems === 0 || applying}>
                {applying ? t('tools_importing') : t('action_import')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
