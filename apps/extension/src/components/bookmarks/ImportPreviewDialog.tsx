/**
 * Import preview (dry run): shows the exact target folder, planned counts, and duplicates before
 * anything is written, then applies the plan and reports created / skipped / failed items.
 */

import { useEffect, useMemo, useState } from 'react';
import type { BookmarkTreeNode } from '@/types';

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

function outcomeTitle(outcome: ImportApplyOutcome): string {
  if (outcome.failed === 0) return t('toast_importSuccess');
  return outcome.bookmarksCreated + outcome.foldersCreated === 0
    ? t('toast_importFailed')
    : t('toast_importPartial');
}

export function ImportPreviewDialog({
  source,
  defaultTargetId,
  onClose,
  onChanged,
}: ImportPreviewDialogProps) {
  const [tree, setTree] = useState<BookmarkTreeNode[] | null>(null);
  const [targetId, setTargetId] = useState('');
  const [strategy, setStrategy] = useState<ImportDuplicateStrategy>(
    DEFAULT_IMPORT_DUPLICATE_STRATEGY,
  );
  const [notice, setNotice] = useState<string | null>(null);

  // Each new file starts from a fresh read of the tree and the default target.
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    setTree(null);
    setNotice(null);
    setStrategy(DEFAULT_IMPORT_DUPLICATE_STRATEGY);
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
        if (!cancelled) setNotice(getErrorMessage(error));
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
      return { plan: null, error: getErrorMessage(error) };
    }
  }, [source, tree, targetId, strategy]);
  const plan = planned?.plan ?? null;
  const targetLabel = targets.find((target) => target.id === targetId)?.label ?? '';
  const plannedItems = plan ? plan.counts.bookmarksToCreate + plan.counts.foldersToCreate : 0;

  const apply = async (): Promise<ReviewApplyReport | undefined> => {
    if (!source || !plan) return undefined;
    setNotice(null);
    // Re-plan against the live tree so the import never applies a stale preview.
    const fresh = await fetchBookmarkTree();
    let freshPlan: ImportPlan;
    try {
      freshPlan = planImport(source.parsed, fresh, plan.targetFolderId, plan.strategy);
    } catch (error) {
      setTree(fresh);
      setNotice(getErrorMessage(error));
      return undefined;
    }
    if (!isSameImportPlan(plan, freshPlan)) {
      setTree(fresh);
      setNotice(t('tools_importPreviewChanged'));
      return undefined;
    }

    const outcome = await applyImportPlan(freshPlan);
    await onChanged();
    return {
      title: outcomeTitle(outcome),
      description: describeOutcome(outcome),
      variant: outcome.failed === 0 ? 'success' : 'destructive',
      // Keep the dialog open so the failures stay readable next to the counts.
      complete: outcome.failed === 0,
      details: [...new Set(outcome.errors)]
        .slice(0, TOOL_LIST_LIMITS.importErrors)
        .map((error) => ({ key: error, text: error })),
      undo:
        outcome.createdRootIds.length > 0
          ? async () => {
              const { removed, failed } = await outcome.undo();
              await onChanged();
              return {
                title: failed ? t('tools_importUndoPartial') : t('tools_importUndone'),
                description: t('tools_importUndoneDesc', [String(removed), String(failed)]),
                variant: failed ? 'destructive' : 'success',
              };
            }
          : undefined,
    };
  };

  const conflicts = plan?.conflicts ?? [];
  const listedConflicts = conflicts.slice(0, TOOL_LIST_LIMITS.importConflicts);
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
    <ReviewApplyDialog
      open={source !== null}
      onClose={onClose}
      title={t('tools_importPreviewTitle')}
      description={t('tools_importPreviewDesc', source?.fileName ?? '')}
      className="max-h-[85vh] overflow-hidden sm:max-w-2xl"
      onApply={apply}
      applyLabel={t('action_import')}
      applyingLabel={t('tools_importing')}
      canApply={plan !== null && plannedItems > 0}
      failureTitle={t('toast_importFailed')}
      outcomeTestId="import-result"
    >
      {(applying) => (
        <div className="space-y-4">
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
              className="rounded-lg border border-warning/40 bg-warning-wash p-3 text-sm text-warning"
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
                {listedConflicts.map((conflict) => (
                  <li key={conflict.id} className="rounded-md bg-muted/40 p-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{getBookmarkDisplayTitle(conflict.title)}</span>
                      <Badge variant="outline">{t(CONFLICT_LABEL_KEYS[conflict.kind])}</Badge>
                      <Badge variant={conflict.skipped ? 'secondary' : 'default'}>
                        {conflict.skipped ? t('tools_importWillSkip') : t('tools_importWillImport')}
                      </Badge>
                    </div>
                    <p className="break-all text-xs text-muted-foreground">
                      <UrlLink href={conflict.url} />
                    </p>
                  </li>
                ))}
              </ul>
              {conflicts.length > listedConflicts.length ? (
                <p className="text-xs text-muted-foreground">
                  {t(
                    'bookmarks_bulkPreviewMore',
                    String(conflicts.length - listedConflicts.length),
                  )}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </ReviewApplyDialog>
  );
}
