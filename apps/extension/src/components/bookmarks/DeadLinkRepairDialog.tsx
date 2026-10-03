/**
 * Reviewed dead-link repairs: the user picks keep, delete, redirect target, archived copy, or an
 * edited URL for each failed or redirected link. Nothing changes until Apply, and the applied
 * batch can be undone.
 */

import { useEffect, useMemo, useState } from 'react';

type DeadLinkRepairDialogProps = {
  /** The scan to review; the dialog is open while this is set. */
  result: DeadLinkScanResult | null;
  onClose: () => void;
  /** Called after bookmarks changed, to refresh views of the tree. */
  onChanged: () => Promise<void> | void;
};

type ChoiceState = { choice: DeadLinkRepairChoice; editedUrl: string };

const CHOICE_LABEL_KEYS = {
  keep: 'tools_deadLinkRepairChoice_keep',
  delete: 'tools_deadLinkRepairChoice_delete',
  redirect: 'tools_deadLinkRepairChoice_redirect',
  archive: 'tools_deadLinkRepairChoice_archive',
  edit: 'tools_deadLinkRepairChoice_edit',
} as const satisfies Record<DeadLinkRepairChoice, string>;

/** Confirmed dead links first, then links that need a manual check, then redirects. */
function reviewRank(item: DeadLinkResultItem): number {
  if (isConfirmedDeadLink(item)) return 0;
  return item.status === 'redirect' ? 2 : 1;
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

function toRepairItem(item: DeadLinkResultItem, state: ChoiceState): DeadLinkRepairItem {
  const newUrl =
    state.choice === 'redirect'
      ? item.redirectUrl
      : state.choice === 'archive'
        ? buildArchiveUrl(item.url)
        : state.choice === 'edit'
          ? state.editedUrl
          : undefined;
  return { id: item.id, title: item.title, scannedUrl: item.url, choice: state.choice, newUrl };
}

function describeOutcome(outcome: DeadLinkRepairOutcome): string {
  return t('tools_deadLinkRepairOutcome', [
    String(outcome.deleted),
    String(outcome.replaced),
    String(outcome.skipped),
    String(outcome.failed),
  ]);
}

export function DeadLinkRepairDialog({ result, onClose, onChanged }: DeadLinkRepairDialogProps) {
  const [choices, setChoices] = useState<Record<string, ChoiceState>>({});

  const candidates = useMemo(
    () =>
      (result?.items.filter(isDeadLinkRepairCandidate) ?? [])
        .map((item, index) => ({ item, index }))
        .sort((a, b) => reviewRank(a.item) - reviewRank(b.item) || a.index - b.index)
        .map(({ item }) => item),
    [result],
  );

  // Every review starts with all links kept, so nothing changes without a choice.
  useEffect(() => {
    if (result) setChoices({});
  }, [result]);

  const stateFor = (item: DeadLinkResultItem): ChoiceState =>
    choices[item.id] ?? { choice: 'keep', editedUrl: item.redirectUrl ?? item.url };
  const repairItems = candidates.map((item) => toRepairItem(item, stateFor(item)));
  const summary = summarizeDeadLinkRepairs(repairItems);
  const actionable = summary.delete + summary.replace;
  const hasInvalidEdit = repairItems.some(
    (item) => item.choice === 'edit' && resolveRepairUrl(item) === undefined,
  );

  const update = (item: DeadLinkResultItem, changes: Partial<ChoiceState>) =>
    setChoices((previous) => ({ ...previous, [item.id]: { ...stateFor(item), ...changes } }));

  const apply = async (): Promise<ReviewApplyReport> => {
    const applied = await applyDeadLinkRepairs(repairItems);
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
        text: t(
          issue.reason === 'changed'
            ? 'tools_deadLinkRepairIssueChanged'
            : 'tools_deadLinkRepairIssueFailed',
          getBookmarkDisplayTitle(issue.title),
        ),
      })),
      undoExpiresAt: applied.expiresAt,
      undo:
        applied.deleted + applied.replaced > 0
          ? async () => {
              const { restored, failed } = await applied.undo();
              await onChanged();
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
          <ul className="space-y-3">
            {candidates.map((item, index) => {
              const state = stateFor(item);
              const title = getBookmarkDisplayTitle(item.title);
              const newUrl = resolveRepairUrl(repairItems[index]);
              const options = availableChoices(item);
              return (
                <li
                  key={item.id}
                  data-testid="dead-link-repair-item"
                  className="space-y-2 rounded-lg border p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{title}</span>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <DeadLinkCategoryBadge item={item} />
                      <Badge variant={item.status === 'redirect' ? 'secondary' : 'destructive'}>
                        {t(`tools_deadLinkStatus_${item.status}`)}
                      </Badge>
                    </div>
                  </div>
                  <p className="break-all text-xs text-muted-foreground">{item.url}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.folderPath || t('tools_rootFolder')}
                  </p>
                  <p className="break-all text-xs text-muted-foreground">
                    {describeDeadLink(item)}
                  </p>
                  <Select
                    value={state.choice}
                    onValueChange={(value) => {
                      if (value !== null) update(item, { choice: value as DeadLinkRepairChoice });
                    }}
                    items={options.map((option) => ({
                      value: option,
                      label: t(CHOICE_LABEL_KEYS[option]),
                    }))}
                    disabled={applying}
                  >
                    <SelectTrigger
                      className="h-8 w-full text-xs sm:w-72"
                      aria-label={t('tools_deadLinkRepairAction', title)}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((option) => (
                        <SelectItem key={option} value={option}>
                          {t(CHOICE_LABEL_KEYS[option])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {state.choice === 'edit' ? (
                    <div className="space-y-1">
                      <Input
                        value={state.editedUrl}
                        onChange={(event) => update(item, { editedUrl: event.target.value })}
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
                    <p className="break-all rounded-md bg-success-wash p-2 text-xs text-success">
                      {t('tools_deadLinkRepairWillChange', newUrl)}
                    </p>
                  ) : null}
                  {state.choice === 'archive' ? (
                    <p className="text-xs text-muted-foreground">
                      {t('tools_deadLinkRepairArchiveNote')}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )
      }
    </ReviewApplyDialog>
  );
}
