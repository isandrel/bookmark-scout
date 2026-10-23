/**
 * How the manager's History shows Audit History records (`lib/bookmark-audit-store.ts`): the
 * status a record has now, the words for its source and kind of change, the filters, and the
 * export file. Kept out of the component so it is tested without rendering.
 */

/** What a record's status line says; `attention` records stay listed under Needs attention. */
export type AuditStatusView = {
  key: MessageKey;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  attention: boolean;
};

const STATUS_VIEWS: Record<AuditState, AuditStatusView> = {
  prepared: { key: 'history_statusInProgress', tone: 'neutral', attention: false },
  verified_success: { key: 'history_statusVerified', tone: 'success', attention: false },
  partially_applied: { key: 'history_statusPartial', tone: 'warning', attention: true },
  failed: { key: 'history_statusFailed', tone: 'danger', attention: false },
  needs_review: { key: 'history_statusNeedsReview', tone: 'warning', attention: true },
  conflicted: { key: 'history_statusConflicted', tone: 'warning', attention: true },
  observed: { key: 'history_statusObserved', tone: 'neutral', attention: false },
};

/** The status of `operation` now: a reserved record past its time limit was interrupted. */
export function auditStatusView(operation: AuditOperation, now = Date.now()): AuditStatusView {
  if (isInterruptedAuditOperation(operation, now)) {
    return { key: 'history_statusInterrupted', tone: 'warning', attention: true };
  }
  return STATUS_VIEWS[operation.state];
}

/** Words for each source; changes from elsewhere never name a writer. */
export const AUDIT_SOURCE_LABEL_KEYS: Record<AuditSource, MessageKey> = {
  manager: 'history_sourceManager',
  tools: 'history_sourceTools',
  popup: 'history_sourcePopup',
  sidepanel: 'history_sourceSidePanel',
  options: 'history_sourceSettings',
  quick_save: 'history_sourceQuickSave',
  context_menu: 'history_sourceContextMenu',
  ask_ai: 'history_sourceAskAi',
  local_agent: 'history_sourceLocalAgent',
  import: 'history_sourceImport',
  background: 'history_sourceBackground',
  source_unknown: 'history_sourceUnknown',
  reconciliation: 'history_sourceReconciliation',
};

/** A backup part's name, or its id for a part this release does not know. */
const partName = (id: string) => (getBackupCategory(id) ? getBackupCategoryLabel(id) : id);

/**
 * How History words each kind of record (`AUDIT_RECORD_KINDS`): what it did, and the line under
 * it. A new kind of record is a new entry here (and in the dialog's `KIND_BODIES`).
 */
export const AUDIT_KIND_VIEWS: Record<
  AuditRecordKind,
  {
    describe(operation: AuditOperation): string;
    summary(operation: AuditOperation): string;
    /** What the read-back checked, when it passed and when it found differences ($1). */
    verifyPassedKey: MessageKey;
    verifyFailedKey: MessageKey;
  }
> = {
  bookmarks: {
    verifyPassedKey: 'history_verifyPassed',
    verifyFailedKey: 'history_verifyFailed',
    describe: ({ label: { action, ...rest } }) =>
      describeBookmarkHistoryLabel({
        // Imports are additions; their own word comes with the import surface.
        action: action === 'import' ? 'add' : action,
        ...rest,
        ...(rest.count === 0 ? { count: undefined } : {}),
      }),
    summary: (operation) => summarizeAuditCounts(operation.counts),
  },
  data: {
    verifyPassedKey: 'history_verifyPassedData',
    verifyFailedKey: 'history_verifyFailedData',
    describe: () => t('history_backupImported'),
    summary: (operation) =>
      formatList((operation.data?.parts ?? []).map((part) => partName(part.id))),
  },
};

/** What a record did, in the current language: `Delete 3 items`, or `Undone: Delete "News"`. */
export function describeAuditOperation(operation: AuditOperation): string {
  const what = AUDIT_KIND_VIEWS[auditKindOf(operation)].describe(operation);
  if (operation.replay === 'undo') return t('toast_undone', what);
  if (operation.replay === 'redo') return t('toast_redone', what);
  return what;
}

/** The line under a record's title: how many items, or a data record's parts. */
export function summarizeAuditOperation(operation: AuditOperation): string {
  return AUDIT_KIND_VIEWS[auditKindOf(operation)].summary(operation);
}

/** A data record's part with its name and what it did, for the dialog. */
export function describeAuditDataPart(part: AuditDataPart): { name: string; line: string } {
  return {
    name: partName(part.id),
    line: t('history_dataPartCounts', [
      t(part.strategy === 'replace' ? 'backup_strategyReplace' : 'backup_strategyMerge'),
      formatCount(part.added),
      formatCount(part.changed),
      formatCount(part.removed),
      formatCount(part.skipped),
    ]),
  };
}

const ELSEWHERE_SOURCES: readonly AuditSource[] = ['source_unknown', 'reconciliation'];

/** Whether a record is of a change seen from elsewhere, which Bookmark Scout did not make. */
export const isFromElsewhere = (operation: AuditOperation) =>
  ELSEWHERE_SOURCES.includes(operation.source);

/**
 * History's filters, in the order the bar shows them: each its label and which records it keeps.
 * A new filter is a new entry.
 */
const AUDIT_FILTERS = {
  all: { labelKey: 'history_filterAll', keeps: () => true },
  attention: {
    labelKey: 'history_filterAttention',
    keeps: (operation: AuditOperation, now: number) => auditStatusView(operation, now).attention,
  },
  extension: {
    labelKey: 'history_filterExtension',
    keeps: (operation: AuditOperation) => !isFromElsewhere(operation),
  },
  elsewhere: { labelKey: 'history_filterElsewhere', keeps: isFromElsewhere },
  data: {
    labelKey: 'history_filterData',
    keeps: (operation: AuditOperation) => auditKindOf(operation) === 'data',
  },
} as const satisfies Record<
  string,
  { labelKey: MessageKey; keeps: (operation: AuditOperation, now: number) => boolean }
>;

export type AuditHistoryFilter = keyof typeof AUDIT_FILTERS;

export const AUDIT_HISTORY_FILTERS = Object.keys(AUDIT_FILTERS) as AuditHistoryFilter[];

export const AUDIT_FILTER_LABEL_KEYS: Record<AuditHistoryFilter, MessageKey> = Object.fromEntries(
  Object.entries(AUDIT_FILTERS).map(([id, filter]) => [id, filter.labelKey]),
) as Record<AuditHistoryFilter, MessageKey>;

/** The records a filter and a search (over what each did and where from) keep, in order. */
export function filterAuditOperations(
  operations: readonly AuditOperation[],
  filter: AuditHistoryFilter,
  query: string,
  now = Date.now(),
): AuditOperation[] {
  const words = query.trim().toLocaleLowerCase();
  const keeps: (operation: AuditOperation, now: number) => boolean = AUDIT_FILTERS[filter].keeps;
  return operations.filter((operation) => {
    if (!keeps(operation, now)) return false;
    if (!words) return true;
    const text = `${describeAuditOperation(operation)} ${summarizeAuditOperation(operation)} ${t(AUDIT_SOURCE_LABEL_KEYS[operation.source])}`;
    return text.toLocaleLowerCase().includes(words);
  });
}

/** The words for each kind of row change and outcome. */
export const AUDIT_CHANGE_LABEL_KEYS: Record<AuditItem['change'], MessageKey> = {
  create: 'history_changeCreate',
  remove: 'history_changeRemove',
  update: 'history_changeUpdate',
  move: 'history_changeMove',
};

export const AUDIT_OUTCOME_LABEL_KEYS: Record<AuditItem['outcome'], MessageKey> = {
  applied: 'history_outcomeApplied',
  skipped: 'history_outcomeSkipped',
  failed: 'history_outcomeFailed',
  conflicted: 'history_outcomeConflicted',
};

/** Why a row was left out, from the reason codes changes report. */
export function auditReasonLabel(reason: string | undefined): string | undefined {
  if (reason === 'deleted') return t('history_reasonDeleted');
  if (reason === 'changed') return t('history_reasonChanged');
  if (reason === 'failed') return t('history_reasonFailed');
  if (reason === 'parent_missing') return t('toast_restoreParentMissing');
  if (reason === 'before_unknown') return t('history_reasonBeforeUnknown');
  return undefined;
}

/**
 * Rows with a key each for rendering: the item, the kind of change, and which time that item has
 * this change in the record (a sort can move one item more than once).
 */
export function keyAuditItems(items: readonly AuditItem[]): { key: string; item: AuditItem }[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = `${item.change}:${item.id}`;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return { key: `${base}:${occurrence}`, item };
  });
}

/** The export file: every record with its rows, as they are stored. */
export function buildAuditHistoryExport(
  records: readonly { operation: AuditOperation; details: AuditDetails | 'missing' | 'corrupt' }[],
  exportedAt = Date.now(),
): string {
  return JSON.stringify(
    {
      format: 'bookmark-scout-history',
      version: AUDIT_SCHEMA_VERSION,
      exportedAt: new Date(exportedAt).toISOString(),
      records: records.map(({ operation, details }) => ({
        ...operation,
        details: typeof details === 'string' ? details : details.items,
        ...(typeof details !== 'string' && details.omitted > 0 ? { omitted: details.omitted } : {}),
      })),
    },
    null,
    2,
  );
}

/** Records under one day heading, newest day first, in the order given. */
export type AuditDayGroup = { key: string; label: string; operations: AuditOperation[] };

/** Groups records (newest first) by local day: Today, Yesterday, then the date. */
export function groupAuditOperationsByDay(
  operations: readonly AuditOperation[],
  now = Date.now(),
): AuditDayGroup[] {
  const dayKey = (time: number) => {
    const date = new Date(time);
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  };
  const today = dayKey(now);
  const yesterday = dayKey(now - MS_PER_DAY);
  const groups: AuditDayGroup[] = [];
  for (const operation of operations) {
    const key = dayKey(operation.startedAt);
    let group = groups.at(-1);
    if (group?.key !== key) {
      const label =
        key === today
          ? t('history_today')
          : key === yesterday
            ? t('history_yesterday')
            : formatDay(operation.startedAt);
      group = { key, label, operations: [] };
      groups.push(group);
    }
    group.operations.push(operation);
  }
  return groups;
}

/**
 * The short line under a record's title: how many items, or, when not all went through, how
 * many were done, skipped, and failed.
 */
export function summarizeAuditCounts({ applied, skipped, failed }: AuditCounts): string {
  if (skipped === 0 && failed === 0) return tPlural('history_itemCount', applied);
  return t('history_counts', [String(applied), String(skipped), String(failed)]);
}
