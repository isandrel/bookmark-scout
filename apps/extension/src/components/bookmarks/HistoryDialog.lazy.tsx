/**
 * The manager's History: every change Bookmark Scout made to bookmarks on this device, from the
 * Audit History (`lib/bookmark-audit-store.ts`), newest first under day headings. A row says what
 * changed, from where, how many items, and when; only a result that needs a look (partial,
 * interrupted, not done) carries a status chip. It opens to the facts, the read-back, Undo while
 * the session still has it, and the items, each with what it was before and after. A restore of a
 * backup (a `data` record) opens to its parts and what each did, with Undo import while its
 * safety copy is kept (the same Undo import as in Settings). Opened by the
 * header's History button or a result's View in History (`useAuditHistoryView`), which opens that
 * record. Loaded on first open (`HistoryDialog.tsx`), so the manager does not start with it.
 */
import {
  ArrowDownAZ,
  ArrowRight,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  DatabaseBackup,
  Download,
  FileInput,
  History,
  Layers,
  type LucideIcon,
  MoveRight,
  Pencil,
  Plus,
  Redo2,
  Search,
  Trash2,
  Undo2,
} from 'lucide-react';
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';

const TONE_CLASSES: Record<AuditStatusView['tone'], string> = {
  success: 'border-success/40 bg-success-wash text-success',
  warning: 'border-warning/40 bg-warning-wash text-warning',
  danger: 'border-destructive/40 bg-destructive-wash text-destructive-text',
  neutral: 'border-border bg-muted text-muted-foreground',
};

/** The icon of a record, by what it did. */
const ACTION_ICONS: Record<AuditOperation['label']['action'], LucideIcon> = {
  add: Plus,
  edit: Pencil,
  move: MoveRight,
  delete: Trash2,
  sort: ArrowDownAZ,
  change: Layers,
  import: FileInput,
};

/** The icon of a record of a kind other than bookmarks, whose icon is its action's. */
const KIND_ICONS: Record<AuditRecordKind, LucideIcon | undefined> = {
  bookmarks: undefined,
  data: DatabaseBackup,
};

/** The icon of an item row, by its change. */
const CHANGE_ICONS: Record<AuditItem['change'], LucideIcon> = {
  create: Plus,
  remove: Trash2,
  update: Pencil,
  move: MoveRight,
};

const historyDialogConfig = readConfig(
  'ui/history-dialog',
  z.strictObject({ item_rows_per_page: boundedNumber({ integer: true }) }),
);
/** Rows shown at first in an opened record; the rest load on request. */
const ROWS_PER_PAGE = historyDialogConfig.item_rows_per_page;

export type HistoryDialogProps = {
  /** Every folder's full path by id, disambiguated where two paths read the same. */
  folderLabels: ReadonlyMap<string, string>;
};

export function HistoryDialogContent({ folderLabels }: HistoryDialogProps) {
  const { open, focusId, closeHistory } = useAuditHistoryView();
  const { state, undoableEntryIds, nextRedoEntryId } = useAuditHistory(open);
  const [filter, setFilter] = useState<AuditHistoryFilter>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [confirm, setConfirm] = useState<'export' | 'clear' | null>(null);
  const filterLabelId = useId();

  // View in History opens its record, whatever the filter or search hid.
  useEffect(() => {
    if (!open || !focusId) return;
    setFilter('all');
    setQuery('');
    setExpanded((current) => new Set(current).add(focusId));
  }, [focusId, open]);

  const operations = state.status === 'ready' ? state.operations : [];
  const groups = useMemo(
    () => groupAuditOperationsByDay(filterAuditOperations(operations, filter, query)),
    [filter, operations, query],
  );

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const show = (id: string) => setExpanded((current) => new Set(current).add(id));

  const exportHistory = async () => {
    const records = await Promise.all(
      operations.map(async (operation) => ({
        operation,
        details: await getAuditDetails(operation.id).catch(() => 'corrupt' as const),
      })),
    );
    const date = toIsoDate(Date.now());
    downloadExport(
      buildAuditHistoryExport(records),
      `bookmark-scout-history-${date}.json`,
      MIME.json,
    );
  };

  const clearHistory = async () => {
    try {
      const { removed, kept } = await clearAuditHistory();
      toast.success({ title: tPlural('history_cleared', removed, [String(kept)]) });
    } catch (error) {
      toast.error({ title: t('history_unavailable'), description: getErrorMessage(error) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : closeHistory())}>
      <DialogContent
        className="flex h-[min(760px,var(--max-height-dialog-screen))] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        data-testid="history-dialog"
      >
        <DialogHeader className="space-y-1 border-b px-5 pt-5 pb-4">
          <DialogTitle>{t('history_title')}</DialogTitle>
          <DialogDescription>
            {t('history_description')} {t('history_descriptionBackups')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 border-b px-5 py-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('history_search')}
              aria-label={t('history_search')}
              className="bg-muted pl-8"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span id={filterLabelId} className="sr-only">
              {t('history_filterLabel')}
            </span>
            <SegmentedControl
              aria-labelledby={filterLabelId}
              value={filter}
              options={AUDIT_HISTORY_FILTERS.map((value) => ({
                value,
                label: t(AUDIT_FILTER_LABEL_KEYS[value]),
              }))}
              onValueChange={(value) => setFilter(value as AuditHistoryFilter)}
            />
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                title={t('history_export')}
                aria-label={t('history_export')}
                disabled={operations.length === 0}
                onClick={() => setConfirm('export')}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title={t('history_clear')}
                aria-label={t('history_clear')}
                disabled={operations.length === 0}
                onClick={() => setConfirm('clear')}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4" data-testid="history-list">
          {state.status === 'loading' ? (
            <p className="py-6 text-sm text-muted-foreground">{t('history_loading')}</p>
          ) : state.status === 'unavailable' ? (
            <Notice tone="danger">{t('history_unavailable')}</Notice>
          ) : (
            <>
              {state.corrupt > 0 ? (
                <Notice tone="warning">{tPlural('history_corrupt', state.corrupt)}</Notice>
              ) : null}
              {groups.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <History className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm">
                    {operations.length === 0 ? t('history_empty') : t('history_noMatches')}
                  </p>
                  {operations.length === 0 ? (
                    <p className="max-w-sm text-xs text-muted-foreground">
                      {t('history_emptyHint')}
                    </p>
                  ) : null}
                </div>
              ) : (
                groups.map((group) => (
                  <section key={group.key} aria-label={group.label}>
                    <h3 className="sticky top-0 z-10 bg-background pt-3 pb-1 text-xs font-medium text-muted-foreground">
                      {group.label}
                    </h3>
                    <ul className="divide-y rounded-lg border">
                      {group.operations.map((operation) => (
                        <HistoryRecord
                          key={operation.id}
                          operation={operation}
                          expanded={expanded.has(operation.id)}
                          focused={operation.id === focusId}
                          onToggle={() => toggle(operation.id)}
                          onShowRecord={show}
                          undoable={
                            operation.undoHistoryId !== undefined &&
                            undoableEntryIds.has(operation.undoHistoryId)
                          }
                          redoable={
                            operation.undoHistoryId !== undefined &&
                            operation.undoHistoryId === nextRedoEntryId
                          }
                          folderLabels={folderLabels}
                        />
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </>
          )}
        </div>

        <ConfirmDialog
          open={confirm === 'export'}
          onOpenChange={(next) => setConfirm(next ? 'export' : null)}
          title={t('history_exportConfirmTitle')}
          description={t('history_exportConfirm')}
          confirmLabel={t('history_export')}
          variant="default"
          onConfirm={() => void exportHistory()}
        />
        <ConfirmDialog
          open={confirm === 'clear'}
          onOpenChange={(next) => setConfirm(next ? 'clear' : null)}
          title={t('history_clearConfirmTitle')}
          description={t('history_clearConfirm')}
          confirmLabel={t('history_clear')}
          onConfirm={() => void clearHistory()}
        />
      </DialogContent>
    </Dialog>
  );
}

function Notice({ tone, children }: { tone: 'warning' | 'danger'; children: ReactNode }) {
  return (
    <p role="alert" className={cn('mt-3 rounded-lg border p-3 text-sm', TONE_CLASSES[tone])}>
      {children}
    </p>
  );
}

function StatusChip({ status }: { status: AuditStatusView }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        TONE_CLASSES[status.tone],
      )}
      data-testid="history-record-status"
    >
      {t(status.key)}
    </span>
  );
}

type HistoryRecordProps = {
  operation: AuditOperation;
  expanded: boolean;
  focused: boolean;
  onToggle: () => void;
  onShowRecord: (id: string) => void;
  undoable: boolean;
  /** Undone, and the newest change Redo would bring back. */
  redoable: boolean;
  folderLabels: ReadonlyMap<string, string>;
};

function HistoryRecord({
  operation,
  expanded,
  focused,
  onToggle,
  onShowRecord,
  undoable,
  redoable,
  folderLabels,
}: HistoryRecordProps) {
  const status = auditStatusView(operation);
  const detailsId = useId();
  const Icon =
    operation.replay === 'undo'
      ? Undo2
      : operation.replay === 'redo'
        ? Redo2
        : (KIND_ICONS[auditKindOf(operation)] ?? ACTION_ICONS[operation.label.action]);
  return (
    <li
      data-testid="history-record"
      data-operation-id={operation.id}
      className={cn(expanded && 'bg-muted/40')}
      ref={(element) => {
        if (focused && element) element.scrollIntoView({ block: 'nearest' });
      }}
    >
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={onToggle}
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium" data-testid="history-record-label">
              {describeAuditOperation(operation)}
            </span>
            {status.tone === 'success' ? (
              // A verified change needs no chip; the check says it read back as intended.
              <span
                className="inline-flex shrink-0 items-center"
                data-testid="history-record-status"
              >
                <CircleCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                <span className="sr-only">{t(status.key)}</span>
              </span>
            ) : (
              <StatusChip status={status} />
            )}
            {operation.undo ? (
              <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                {operation.undo.complete
                  ? t('history_badgeUndone')
                  : t('history_badgePartlyUndone')}
              </span>
            ) : null}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {t(AUDIT_SOURCE_LABEL_KEYS[operation.source])} · {summarizeAuditOperation(operation)}
          </span>
        </span>
        <time
          className="shrink-0 text-xs text-muted-foreground tabular-nums"
          dateTime={new Date(operation.startedAt).toISOString()}
          title={formatDateTime(operation.startedAt)}
        >
          {formatTime(operation.startedAt)}
        </time>
        <ChevronRight
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
            expanded && 'rotate-90',
          )}
          aria-hidden="true"
        />
      </button>
      {expanded ? (
        <div id={detailsId} className="space-y-3 px-3 pt-1 pb-3 pl-10">
          <HistoryRecordDetails
            operation={operation}
            undoable={undoable}
            redoable={redoable}
            onShowRecord={onShowRecord}
            folderLabels={folderLabels}
          />
        </div>
      ) : null}
    </li>
  );
}

type RecordBodyProps = Omit<HistoryRecordProps, 'expanded' | 'focused' | 'onToggle'>;

/** What an opened record shows under its facts, by kind (`AUDIT_RECORD_KINDS`). */
const KIND_BODIES: Record<AuditRecordKind, (props: RecordBodyProps) => ReactNode> = {
  bookmarks: BookmarkRecordBody,
  data: DataRecordBody,
};

function HistoryRecordDetails(props: RecordBodyProps) {
  const Body = KIND_BODIES[auditKindOf(props.operation)];
  return (
    <>
      <RecordFacts operation={props.operation} />
      <Body {...props} />
    </>
  );
}

/** The record's facts: where from, when, its counts, and the read-back. */
function RecordFacts({ operation }: { operation: AuditOperation }) {
  const { verification } = operation;
  const view = AUDIT_KIND_VIEWS[auditKindOf(operation)];
  const elsewhere = isFromElsewhere(operation);
  const facts: { label: string; value: ReactNode }[] = [
    { label: t('history_factSource'), value: t(AUDIT_SOURCE_LABEL_KEYS[operation.source]) },
    ...(operation.data?.fileName
      ? [{ label: t('history_factFile'), value: operation.data.fileName }]
      : []),
    ...(operation.actorLabel
      ? [{ label: t('history_factAgentName'), value: operation.actorLabel }]
      : []),
    ...(operation.observedSince !== undefined
      ? [
          {
            label: t('history_factObservedSince'),
            value: t('history_between', [
              formatDateTime(operation.observedSince),
              formatDateTime(operation.startedAt),
            ]),
          },
        ]
      : [
          { label: t('history_factStarted'), value: formatDateTime(operation.startedAt) },
          ...(operation.finishedAt
            ? [{ label: t('history_factFinished'), value: formatDateTime(operation.finishedAt) }]
            : []),
        ]),
    // A change seen from elsewhere was neither planned nor checked by Bookmark Scout.
    ...(elsewhere
      ? []
      : [
          {
            label: t('history_factResult'),
            value: t('history_factCounts', [
              String(operation.counts.planned),
              String(operation.counts.applied),
              String(operation.counts.skipped),
              String(operation.counts.failed),
            ]),
          },
          {
            label: t('history_factCheck'),
            value:
              verification?.status === 'passed' ? (
                <span className="inline-flex items-center gap-1.5">
                  <CircleCheck className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
                  {t(view.verifyPassedKey)}
                </span>
              ) : verification?.status === 'failed' ? (
                <span className="inline-flex items-center gap-1.5 text-warning">
                  <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {tPlural(view.verifyFailedKey, verification.mismatchCount ?? 0)}
                </span>
              ) : (
                t('history_verifyNotRun')
              ),
          },
        ]),
  ];
  return (
    <dl
      className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs"
      data-testid="history-record-facts"
    >
      {facts.map((fact) => (
        <div key={fact.label} className="contents">
          <dt className="text-muted-foreground">{fact.label}</dt>
          <dd className="min-w-0 break-words">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The links between a record and its undo. */
function RecordLinks({
  operation,
  onShowRecord,
}: Pick<RecordBodyProps, 'operation' | 'onShowRecord'>) {
  return (
    <>
      {operation.relatedOperationId ? (
        <RecordLink onClick={() => onShowRecord(operation.relatedOperationId ?? '')}>
          {t('history_showOriginal')}
        </RecordLink>
      ) : null}
      {operation.undo ? (
        <RecordLink onClick={() => onShowRecord(operation.undo?.operationId ?? '')}>
          {t('history_showUndo')}
        </RecordLink>
      ) : null}
    </>
  );
}

/**
 * A backup restore: Undo import while its safety copy is kept (or why not), and each part with
 * how it was imported and what it did.
 */
function DataRecordBody({ operation, onShowRecord }: RecordBodyProps) {
  const [availability, setAvailability] = useState<
    Awaited<ReturnType<typeof getBackupUndoAvailability>> | 'loading'
  >('loading');
  const [undoing, setUndoing] = useState(false);
  useEffect(() => {
    let current = true;
    if (operation.replay || operation.state === 'failed') return;
    void getBackupUndoAvailability(operation).then(
      (value) => {
        if (current) setAvailability(value);
      },
      () => {
        if (current) setAvailability({ available: false, reason: 'expired' });
      },
    );
    return () => {
      current = false;
    };
  }, [operation]);
  const undo = async () => {
    setUndoing(true);
    try {
      await runBackupUndo(operation.id);
    } finally {
      setUndoing(false);
    }
  };
  const canHaveUndo = !operation.replay && operation.state !== 'failed';
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {canHaveUndo && availability !== 'loading' ? (
          availability.available ? (
            <Button size="sm" variant="outline" disabled={undoing} onClick={() => void undo()}>
              <Undo2 />
              {t('backup_undoImport')}
            </Button>
          ) : operation.undo ? null : (
            <p className="text-xs text-muted-foreground" data-testid="history-undo-unavailable">
              {describeBackupUndoUnavailable(availability.reason)}
            </p>
          )
        ) : null}
        <RecordLinks operation={operation} onShowRecord={onShowRecord} />
      </div>
      <ul
        className="divide-y rounded-md border bg-card"
        data-testid="history-data-parts"
        aria-label={t('history_dataPartsLabel')}
      >
        {(operation.data?.parts ?? []).map((part) => {
          const { name, line } = describeAuditDataPart(part);
          return (
            <li key={part.id} className="px-3 py-2 text-xs" data-testid="history-data-part">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                {part.failed ? (
                  <span className="shrink-0 font-medium text-warning">
                    {t('history_outcomeFailed')}
                  </span>
                ) : null}
              </div>
              <p className="text-muted-foreground tabular-nums">{line}</p>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function BookmarkRecordBody({
  operation,
  undoable,
  redoable,
  onShowRecord,
  folderLabels,
}: RecordBodyProps) {
  const [details, setDetails] = useState<AuditDetails | 'missing' | 'corrupt' | 'loading'>(
    'loading',
  );
  const [rows, setRows] = useState(ROWS_PER_PAGE);
  const [undoing, setUndoing] = useState(false);
  // Removed items kept as recovery points, restorable once the session's undo is gone.
  const [recoverable, setRecoverable] = useState(0);
  const [confirmRestore, setConfirmRestore] = useState(false);

  useEffect(() => {
    let current = true;
    if (operation.undo || isFromElsewhere(operation)) return;
    void countRecoveryCheckpoints(operation.id)
      .catch(() => 0)
      .then((count) => {
        if (current) setRecoverable(count);
      });
    return () => {
      current = false;
    };
  }, [operation]);

  const restore = async () => {
    setUndoing(true);
    try {
      const outcome = await restoreFromCheckpoints(operation);
      if (outcome.alreadyUndone) toast({ title: t('qaManager_alreadyUndone') });
      else if (outcome.parentMissing > 0) {
        toast.error({
          title: tPlural('history_restoredPartial', outcome.restored, [
            String(outcome.parentMissing),
          ]),
        });
      } else toast.success({ title: tPlural('history_restored', outcome.restored) });
    } catch (error) {
      toast.error({ title: t('error_generic'), description: getErrorMessage(error) });
    } finally {
      setUndoing(false);
    }
  };

  useEffect(() => {
    let current = true;
    void getAuditDetails(operation.id)
      .catch(() => 'corrupt' as const)
      .then((value) => {
        if (current) setDetails(value);
      });
    return () => {
      current = false;
    };
  }, [operation.id]);

  const replay = async (step: 'undo' | 'redo') => {
    if (!operation.undoHistoryId) return;
    setUndoing(true);
    try {
      reportBookmarkHistoryOutcome(
        step,
        step === 'undo'
          ? await undoBookmarkChange(operation.undoHistoryId)
          : await redoBookmarkChange(),
      );
    } catch (error) {
      toast.error({ title: t('error_generic'), description: getErrorMessage(error) });
    } finally {
      setUndoing(false);
    }
  };

  const elsewhere = isFromElsewhere(operation);
  const canHaveUndo =
    !elsewhere && !operation.replay && operation.state !== 'failed' && !operation.undo;

  return (
    <>
      <RestoreConfirm
        open={confirmRestore}
        count={recoverable}
        onOpenChange={setConfirmRestore}
        onConfirm={() => void restore()}
      />

      <div className="flex flex-wrap items-center gap-2">
        {undoable && canHaveUndo ? (
          <Button
            size="sm"
            variant="outline"
            disabled={undoing}
            onClick={() => void replay('undo')}
          >
            <Undo2 />
            {t('action_undo')}
          </Button>
        ) : redoable && operation.undo ? (
          <Button
            size="sm"
            variant="outline"
            disabled={undoing}
            onClick={() => void replay('redo')}
          >
            <Redo2 />
            {t('action_redo')}
          </Button>
        ) : canHaveUndo && recoverable > 0 ? (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={undoing}
              onClick={() => setConfirmRestore(true)}
            >
              <Undo2 />
              {t('history_restore')}
            </Button>
            <p className="text-xs text-muted-foreground" data-testid="history-restore-hint">
              {t('history_restoreHint')}
            </p>
          </>
        ) : canHaveUndo ? (
          <p className="text-xs text-muted-foreground" data-testid="history-undo-unavailable">
            {t('history_undoUnavailable')}
          </p>
        ) : elsewhere ? (
          <p className="text-xs text-muted-foreground" data-testid="history-undo-unavailable">
            {t('history_noUndoElsewhere')}
          </p>
        ) : null}
        <RecordLinks operation={operation} onShowRecord={onShowRecord} />
      </div>

      {details === 'loading' ? (
        <p className="text-xs text-muted-foreground">{t('history_loading')}</p>
      ) : details === 'missing' ? (
        <p className="text-xs text-muted-foreground">{t('history_detailsMissing')}</p>
      ) : details === 'corrupt' ? (
        <Notice tone="warning">{t('history_detailsCorrupt')}</Notice>
      ) : (
        <>
          <ul
            className="divide-y rounded-md border bg-card"
            data-testid="history-items"
            aria-label={t('history_itemsLabel')}
          >
            {keyAuditItems(details.items.slice(0, rows)).map(({ key, item }) => (
              <HistoryItemRow key={key} item={item} folderLabels={folderLabels} />
            ))}
          </ul>
          {details.items.length > rows ? (
            <Button size="sm" variant="ghost" onClick={() => setRows(rows + ROWS_PER_PAGE)}>
              {t('history_showMoreItems', String(details.items.length - rows))}
            </Button>
          ) : null}
          {details.omitted > 0 ? (
            <p className="text-xs text-muted-foreground">
              {tPlural('history_omitted', details.omitted)}
            </p>
          ) : null}
        </>
      )}
    </>
  );
}

/** Asks before bringing removed items back from their recovery points. */
function RestoreConfirm({
  open,
  count,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  count: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('history_restoreConfirmTitle')}
      description={tPlural('history_restoreConfirm', count)}
      confirmLabel={t('history_restore')}
      variant="default"
      onConfirm={onConfirm}
    />
  );
}

/** A link to a linked record (the change an undo undid, or the undo of a change). */
function RecordLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="rounded-sm text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Old value struck through, then the new one: what an edit changed. */
function BeforeAfter({ before, after, mono }: { before: string; after: string; mono?: boolean }) {
  return (
    <span className={cn('flex min-w-0 flex-wrap items-center gap-x-1.5', mono && 'font-mono')}>
      <del className="break-all text-muted-foreground">{before}</del>
      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      <ins className="break-all no-underline">{after}</ins>
    </span>
  );
}

function HistoryItemRow({
  item,
  folderLabels,
}: {
  item: AuditItem;
  folderLabels: ReadonlyMap<string, string>;
}) {
  const folder = (id: string | undefined) =>
    id === undefined ? '' : (folderLabels.get(id) ?? t('history_folderGone', id));
  const position = (at: AuditItem['before']) => String((at?.index ?? 0) + 1);
  // Where the item was or went, as label and value rows like the record's own facts.
  const places: { label: string; value: ReactNode }[] =
    item.change === 'move'
      ? [
          {
            label: t('history_itemFolder'),
            value:
              item.before?.parentId === item.after?.parentId ? (
                folder(item.after?.parentId)
              ) : (
                <BeforeAfter
                  before={folder(item.before?.parentId)}
                  after={folder(item.after?.parentId)}
                />
              ),
          },
          {
            label: t('history_itemPosition'),
            value: <BeforeAfter before={position(item.before)} after={position(item.after)} />,
          },
        ]
      : item.change === 'remove' && item.before?.parentId !== undefined
        ? [
            { label: t('history_itemWasIn'), value: folder(item.before.parentId) },
            { label: t('history_itemPosition'), value: position(item.before) },
          ]
        : item.change === 'create' && item.after?.parentId !== undefined
          ? [
              { label: t('history_itemAddedTo'), value: folder(item.after.parentId) },
              { label: t('history_itemPosition'), value: position(item.after) },
            ]
          : [];
  const Icon = CHANGE_ICONS[item.change];
  const reason = auditReasonLabel(item.reason);
  const titleChanged = item.before?.title !== undefined && item.after?.title !== undefined;
  const urlChanged = item.before?.url !== undefined && item.after?.url !== undefined;

  return (
    <li className="flex gap-2.5 px-3 py-2 text-xs" data-testid="history-item">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="sr-only">{t(AUDIT_CHANGE_LABEL_KEYS[item.change])}</span>
          <span className="min-w-0 flex-1 truncate text-sm" title={item.title}>
            {getBookmarkDisplayTitle(item.title)}
          </span>
          <span
            className={cn(
              'shrink-0',
              item.outcome === 'applied' ? 'text-muted-foreground' : 'font-medium text-warning',
            )}
            data-testid="history-item-outcome"
          >
            {t(AUDIT_OUTCOME_LABEL_KEYS[item.outcome])}
          </span>
        </div>
        {item.url && !urlChanged ? (
          // The exact address, shortened on screen; the tooltip holds it whole.
          <p className="truncate font-mono text-muted-foreground" title={item.url}>
            <UrlLink href={item.url} data-slot="history-item-url" />
          </p>
        ) : null}
        {places.length > 0 ? (
          <dl
            className="grid grid-cols-[max-content_1fr] gap-x-3 text-muted-foreground"
            data-slot="history-item-place"
          >
            {places.map((place) => (
              <div key={place.label} className="contents">
                <dt>{place.label}</dt>
                <dd className="min-w-0 break-words text-foreground">{place.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {titleChanged ? (
          <BeforeAfter before={item.before?.title ?? ''} after={item.after?.title ?? ''} />
        ) : null}
        {urlChanged ? (
          <BeforeAfter before={item.before?.url ?? ''} after={item.after?.url ?? ''} mono />
        ) : null}
        {item.descendants ? (
          <p className="text-muted-foreground">{tPlural('history_itemInside', item.descendants)}</p>
        ) : null}
        {reason ? <p className="text-warning">{reason}</p> : null}
      </div>
    </li>
  );
}
