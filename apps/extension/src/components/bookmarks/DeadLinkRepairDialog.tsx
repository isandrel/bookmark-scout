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
  const { toast } = useToast();
  const [choices, setChoices] = useState<Record<string, ChoiceState>>({});
  const [applying, setApplying] = useState(false);
  const [outcome, setOutcome] = useState<DeadLinkRepairOutcome | null>(null);
  const [undoHandler, setUndoHandler] = useState<(() => void) | null>(null);

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
    if (!result) return;
    setChoices({});
    setOutcome(null);
    setUndoHandler(null);
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

  const undo = async (applied: DeadLinkRepairOutcome) => {
    const { restored, failed } = await undoDeadLinkRepairs(applied);
    await onChanged();
    toast({
      title: failed ? t('tools_deadLinkRepairUndoPartial') : t('tools_deadLinkRepairUndone'),
      description: t('tools_deadLinkRepairUndoneDesc', [String(restored), String(failed)]),
      variant: failed ? 'destructive' : 'success',
    });
  };

  const handleApply = async () => {
    if (actionable === 0 || hasInvalidEdit) return;
    setApplying(true);
    try {
      const applied = await applyDeadLinkRepairs(repairItems);
      await onChanged();
      const complete = applied.skipped === 0 && applied.failed === 0;
      const changed = applied.deleted + applied.replaced;
      // One undo per batch, whether triggered from the toast or the dialog.
      let undoUsed = false;
      const runUndo = () => {
        if (undoUsed) return;
        undoUsed = true;
        setUndoHandler(null);
        void undo(applied);
      };
      toast({
        title: complete ? t('tools_deadLinkRepairApplied') : t('tools_deadLinkRepairPartial'),
        description: describeOutcome(applied),
        variant: complete ? 'success' : 'destructive',
        duration: BOOKMARK_DELETION_UNDO_WINDOW_MS,
        action:
          changed > 0 ? <ToastAction onClick={runUndo}>{t('action_undo')}</ToastAction> : undefined,
      });
      if (complete) {
        onClose();
      } else {
        // Keep the dialog open so skipped and failed links stay readable next to the counts.
        setOutcome(applied);
        if (changed > 0) setUndoHandler(() => runUndo);
      }
    } catch (error) {
      toast({
        title: t('toast_toolFailed'),
        description: error instanceof Error ? error.message : t('error_unknown'),
        variant: 'destructive',
      });
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog
      open={result !== null}
      onOpenChange={(open) => {
        if (!open && !applying) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('tools_deadLinkRepairTitle')}</DialogTitle>
          <DialogDescription>{t('tools_deadLinkRepairDesc')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {outcome ? (
            <div
              role="alert"
              data-testid="dead-link-repair-result"
              className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm"
            >
              <p>{describeOutcome(outcome)}</p>
              <ul className="list-disc space-y-1 pl-5 text-xs">
                {outcome.issues.map((issue) => (
                  <li key={issue.id} className="break-words">
                    {t(
                      issue.reason === 'changed'
                        ? 'tools_deadLinkRepairIssueChanged'
                        : 'tools_deadLinkRepairIssueFailed',
                      issue.title || t('bookmarks_untitled'),
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : candidates.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t('state_noDeadLinksFound')}
            </div>
          ) : (
            <ul className="space-y-3">
              {candidates.map((item, index) => {
                const state = stateFor(item);
                const repair = repairItems[index];
                const title = item.title || t('bookmarks_untitled');
                const newUrl = resolveRepairUrl(repair);
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
                          <p className="text-xs text-destructive">
                            {t('tools_deadLinkRepairInvalidUrl')}
                          </p>
                        ) : null}
                      </div>
                    ) : newUrl ? (
                      <p className="break-all rounded-md bg-emerald-500/10 p-2 text-xs text-emerald-700 dark:text-emerald-300">
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
          )}
        </div>

        {!outcome && candidates.length > 0 ? (
          <p data-testid="dead-link-repair-summary" className="text-sm font-medium">
            {t('tools_deadLinkRepairSummary', [
              String(summary.delete),
              String(summary.replace),
              String(summary.keep),
            ])}
          </p>
        ) : null}

        <DialogFooter className="gap-2">
          {outcome ? (
            <>
              {undoHandler ? (
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
              <Button
                onClick={handleApply}
                disabled={actionable === 0 || hasInvalidEdit || applying}
              >
                {applying
                  ? t('action_applying')
                  : tPlural('tools_deadLinkRepairApply', actionable)}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
