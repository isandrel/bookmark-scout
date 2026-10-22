/**
 * Changed by rules: under Smart Rules in Settings, what Tag New Bookmarks and Move New Bookmarks
 * did lately, and what reviewed runs tagged (`rule-auto-log.ts`), newest first, each with Undo,
 * and Clear list. Shown once there is one.
 */
import { Undo2 } from 'lucide-react';

/** Why a move could not be put back, by the undo's result. */
const MOVE_NOT_UNDONE_KEYS = {
  deleted: 'rules_autoLogUndoDeleted',
  changed: 'rules_autoLogUndoChanged',
  parentMissing: 'rules_autoLogUndoParentMissing',
} as const satisfies Record<string, MessageKey>;

function entryTitle(entry: RuleAutoEntry): string {
  return entry.kind === 'run' ? t('rules_autoLogRun') : entry.title;
}

function describeEntry(entry: RuleAutoEntry): string {
  switch (entry.kind) {
    case 'tag':
      return t('rules_autoLogTags', [formatList(entry.tags), formatDateTime(entry.at)]);
    case 'move':
      return t('rules_autoLogMoved', [entry.to.path, formatDateTime(entry.at)]);
    case 'run': {
      const listed = entry.tagged.reduce((sum, group) => sum + group.bookmarkIds.length, 0);
      const summary = t('rules_autoLogRunDesc', [
        String(listed + entry.omitted),
        String(entry.moved),
        formatDateTime(entry.at),
      ]);
      return entry.omitted > 0
        ? `${summary} ${t('rules_autoLogRunOmitted', String(entry.omitted))}`
        : summary;
    }
  }
}

function undoLabel(entry: RuleAutoEntry): string {
  switch (entry.kind) {
    case 'tag':
      return t('rules_autoLogUndoLabel', getBookmarkDisplayTitle(entry.title));
    case 'move':
      return t('rules_autoLogUndoMoveLabel', getBookmarkDisplayTitle(entry.title));
    case 'run':
      return t('rules_autoLogUndoRunLabel');
  }
}

export function RuleAutoLogList() {
  const { value: entries } = useStoredValue(ruleAutoLogValue);
  if (entries.length === 0) return null;

  const undo = async (id: string) => {
    try {
      const outcome = await undoRuleAutoChange(id);
      if (!outcome) return;
      if (outcome.kind === 'tag') {
        toast.success({
          title: t('rules_autoLogUndone'),
          description: tPlural('rules_autoLogUndoneDesc', outcome.removed),
        });
      } else if (outcome.kind === 'run') {
        toast.success({
          title: t('rules_autoLogUndone'),
          description: tPlural('rules_autoLogUndoneRunDesc', outcome.bookmarks),
        });
      } else if (outcome.result === 'moved') {
        toast.success({ title: t('rules_autoLogMovedBack') });
      } else {
        toast.error({
          title: t('rules_autoLogNotMovedBack'),
          description: t(MOVE_NOT_UNDONE_KEYS[outcome.result]),
        });
      }
    } catch (error) {
      toast.error({ title: t('toast_toolFailed'), description: getErrorMessage(error) });
    }
  };

  return (
    <section data-testid="rule-auto-log" className="mt-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">{t('rules_autoLogTitle')}</h4>
        <Button size="sm" variant="ghost" onClick={() => void clearRuleAutoLog()}>
          {t('rules_autoLogClear')}
        </Button>
      </div>
      <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
        {entries.map((entry) => {
          const title = entryTitle(entry);
          return (
            <li
              key={entry.id}
              data-testid="rule-auto-entry"
              data-kind={entry.kind}
              className="flex items-center gap-2 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm" title={title}>
                  {entry.kind === 'run' ? title : getBookmarkDisplayTitle(title)}
                </p>
                <p className="truncate text-xs text-muted-foreground" title={describeEntry(entry)}>
                  {describeEntry(entry)}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                aria-label={undoLabel(entry)}
                onClick={() => void undo(entry.id)}
              >
                <Undo2 />
                {t('action_undo')}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
