/**
 * Reviewed dead-link repairs: each failed or redirected link starts on the action its category's
 * setting names (Keep as is, unless changed in Settings), and the user changes one link, or every
 * selected one, to keep, delete, redirect target, archived copy, or an edited URL. Nothing changes
 * until Apply, and the applied batch can be undone.
 */

import { useEffect, useMemo, useState } from 'react';

export type DeadLinkRepairDialogProps = {
  /** The scan to review; the dialog is open while this is set. */
  result: DeadLinkScanResult | null;
  onClose: () => void;
  /** Called after bookmarks changed, to refresh views of the tree. */
  onChanged: () => Promise<void> | void;
};

/** The line a partial apply lists for a repair left out, by why. */
const ISSUE_KEYS = {
  deleted: 'qaManager_repairDeleted',
  changed: 'tools_deadLinkRepairIssueChanged',
  failed: 'tools_deadLinkRepairIssueFailed',
} as const satisfies Record<DeadLinkRepairIssue['reason'], string>;

/** The categories the review lists, in order; the choices a batch can set. */
const REPAIR_GROUPS = ['dead', 'check', 'redirect'] as const satisfies readonly DeadLinkGroup[];
type RepairGroup = (typeof REPAIR_GROUPS)[number];
const BATCH_CHOICES = [
  'keep',
  'delete',
  'redirect',
  'archive',
] as const satisfies readonly DeadLinkRepairChoice[];

/** Confirmed dead links first, then links that need a manual check, then redirects. */
function reviewRank(item: DeadLinkResultItem): number {
  return REPAIR_GROUPS.indexOf(deadLinkGroup(item) as RepairGroup);
}

function availableChoices(item: DeadLinkResultItem): DeadLinkRepairChoice[] {
  return [
    'keep',
    'delete',
    ...(item.redirectUrl ? (['redirect'] as const) : []),
    ...(isWebUrl(item.url) ? (['archive'] as const) : []),
    'edit',
  ];
}

function toRepairItem(
  item: DeadLinkResultItem,
  choice: DeadLinkRepairChoice,
  editedUrl: string,
): DeadLinkRepairItem {
  const newUrl =
    choice === 'redirect'
      ? item.redirectUrl
      : choice === 'archive'
        ? buildArchiveUrl(item.url)
        : choice === 'edit'
          ? editedUrl
          : undefined;
  return { id: item.id, title: item.title, scannedUrl: item.url, choice, newUrl };
}

function describeOutcome(outcome: DeadLinkRepairOutcome): string {
  return t('tools_deadLinkRepairOutcome', [
    String(outcome.deleted),
    String(outcome.replaced),
    String(outcome.skipped),
    String(outcome.failed),
  ]);
}

export function DeadLinkRepairDialogContent({
  result,
  onClose,
  onChanged,
}: DeadLinkRepairDialogProps) {
  const { value: defaultDead } = useSetting('deadLinksOnDead');
  const { value: defaultCheck } = useSetting('deadLinksOnCheck');
  const { value: defaultRedirect } = useSetting('deadLinksOnRedirect');
  const defaults: Record<RepairGroup, DeadLinkRepairChoice> = {
    dead: defaultDead,
    check: defaultCheck,
    redirect: defaultRedirect,
  };
  const [choices, setChoices] = useState<Record<string, DeadLinkRepairChoice>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});

  const candidates = useMemo(
    () =>
      (result?.items.filter(isDeadLinkRepairCandidate) ?? [])
        .map((item, index) => ({ item, index }))
        .sort((a, b) => reviewRank(a.item) - reviewRank(b.item) || a.index - b.index)
        .map(({ item }) => item),
    [result],
  );

  // Every review starts from the default actions.
  useEffect(() => {
    if (!result) return;
    setChoices({});
    setEdits({});
  }, [result]);

  /** The user's pick, or its category's default when the link offers it, else Keep as is. */
  const choiceOf = (item: DeadLinkResultItem): DeadLinkRepairChoice => {
    const picked = choices[item.id];
    if (picked) return picked;
    const fallback = defaults[deadLinkGroup(item) as RepairGroup];
    return availableChoices(item).includes(fallback) ? fallback : 'keep';
  };
  const editedUrlOf = (item: DeadLinkResultItem) => edits[item.id] ?? item.redirectUrl ?? item.url;
  const repairItems = candidates.map((item) =>
    toRepairItem(item, choiceOf(item), editedUrlOf(item)),
  );
  const summary = summarizeDeadLinkRepairs(repairItems);
  const actionable = summary.delete + summary.replace;
  const hasInvalidEdit = repairItems.some(
    (item) => item.choice === 'edit' && resolveRepairUrl(item) === undefined,
  );
  const choose = (ids: readonly string[], choice: DeadLinkRepairChoice) =>
    setChoices((previous) => ({
      ...previous,
      ...Object.fromEntries(ids.map((id) => [id, choice])),
    }));

  const apply = async (): Promise<ReviewApplyReport> => {
    const applied = await applyDeadLinkRepairs(repairItems);
    if (applied.background)
      return { ...reportBackgroundApply(applied), complete: true, details: [] };
    await onChanged();
    const complete = applied.skipped === 0 && applied.failed === 0;
    return {
      title: complete ? t('tools_deadLinkRepairApplied') : t('tools_deadLinkRepairPartial'),
      description: describeOutcome(applied),
      variant: complete ? 'success' : 'destructive',
      // Keep the dialog open so skipped and failed links stay readable next to the counts.
      complete,
      details: applied.issues.map((issue) => ({
        key: issue.id,
        text: t(ISSUE_KEYS[issue.reason], getBookmarkDisplayTitle(issue.title)),
      })),
      undoExpiresAt: applied.expiresAt,
      undo:
        applied.deleted + applied.replaced > 0
          ? async () => {
              const { restored, failed, alreadyUndone } = await applied.undo();
              await onChanged();
              if (alreadyUndone) return alreadyUndoneOutcome();
              return {
                title: failed
                  ? t('tools_deadLinkRepairUndoPartial')
                  : t('tools_deadLinkRepairUndone'),
                description: t('tools_deadLinkRepairUndoneDesc', [
                  String(restored),
                  String(failed),
                ]),
                variant: failed ? 'destructive' : 'success',
              };
            }
          : undefined,
    };
  };

  return (
    <ReviewApplyDialog
      open={result !== null}
      onClose={onClose}
      title={t('tools_deadLinkRepairTitle')}
      description={t('tools_deadLinkRepairDesc')}
      className="max-h-[85vh] overflow-hidden sm:max-w-3xl"
      onApply={apply}
      applyLabel={tPlural('tools_deadLinkRepairApply', actionable)}
      applyingLabel={t('action_applying')}
      canApply={actionable > 0 && !hasInvalidEdit}
      failureTitle={t('toast_toolFailed')}
      outcomeTestId="dead-link-repair-result"
      summary={
        candidates.length > 0 ? (
          <p data-testid="dead-link-repair-summary" className="text-sm font-medium">
            {t('tools_deadLinkRepairSummary', [
              String(summary.delete),
              String(summary.replace),
              String(summary.keep),
            ])}
          </p>
        ) : null
      }
    >
      {(applying) =>
        candidates.length === 0 ? (
          <ToolEmptyState message={t('state_noDeadLinksFound')} />
        ) : (
          <ReviewList
            items={candidates}
            idOf={(item) => item.id}
            categories={REPAIR_GROUPS}
            categoryOf={(item) => deadLinkGroup(item) as RepairGroup}
            categoryLabel={deadLinkGroupLabel}
            actionsOf={availableChoices}
            actionLabel={(choice) => t(DEAD_LINK_REPAIR_CHOICE_LABEL_KEYS[choice])}
            batchActions={BATCH_CHOICES}
            actionOf={choiceOf}
            onAction={choose}
            titleOf={(item) => getBookmarkDisplayTitle(item.title)}
            renderBadges={(item) => <DeadLinkCategoryBadge item={item} />}
            disabled={applying}
            rowTestId="dead-link-repair-item"
            renderDetails={(item) => {
              const choice = choiceOf(item);
              const newUrl = resolveRepairUrl(toRepairItem(item, choice, editedUrlOf(item)));
              const title = getBookmarkDisplayTitle(item.title);
              return (
                <>
                  <p className="truncate text-xs text-muted-foreground">
                    <UrlLink href={item.url} />
                  </p>
                  <p className="break-all text-xs text-muted-foreground">
                    {item.folderPath || t('tools_rootFolder')} · <DeadLinkDescription item={item} />
                  </p>
                  {choice === 'edit' ? (
                    <div className="space-y-1">
                      <Input
                        value={editedUrlOf(item)}
                        onChange={(event) =>
                          setEdits((previous) => ({ ...previous, [item.id]: event.target.value }))
                        }
                        aria-label={t('tools_deadLinkRepairNewUrl', title)}
                        aria-invalid={newUrl === undefined}
                        disabled={applying}
                        className="h-8 text-xs"
                      />
                      {newUrl === undefined ? (
                        <p className="text-xs text-destructive-text">
                          {t('tools_deadLinkRepairInvalidUrl')}
                        </p>
                      ) : null}
                    </div>
                  ) : newUrl ? (
                    <p className="break-all rounded-md bg-success-wash px-2 py-1 text-xs text-success">
                      {t('tools_deadLinkRepairWillChange', newUrl)}
                    </p>
                  ) : null}
                  {choice === 'archive' ? (
                    <p className="text-xs text-muted-foreground">
                      {t('tools_deadLinkRepairArchiveNote')}
                    </p>
                  ) : null}
                </>
              );
            }}
          />
        )
      }
    </ReviewApplyDialog>
  );
}
