/**
 * Changed automatically: under Smart Rules in Settings, what Tag New Bookmarks and Move New
 * Bookmarks did lately (`rule-auto-log.ts`), newest first, each with Undo, and Clear list. Shown
 * once there is one.
 */
import { Undo2 } from 'lucide-react';

/** Why a move could not be put back, by the undo's result. */
const MOVE_NOT_UNDONE_KEYS = {
  deleted: 'rules_autoLogUndoDeleted',
  changed: 'rules_autoLogUndoChanged',
  parentMissing: 'rules_autoLogUndoParentMissing',
} as const satisfies Record<string, MessageKey>;

function describeEntry(entry: RuleAutoEntry): string {
  return entry.kind === 'tag'
    ? t('rules_autoLogTags', [formatList(entry.tags), formatDateTime(entry.at)])
    : t('rules_autoLogMoved', [entry.to.path, formatDateTime(entry.at)]);
}

function undoLabel(entry: RuleAutoEntry): string {
  const title = getBookmarkDisplayTitle(entry.title);
  return entry.kind === 'tag'
    ? t('rules_autoLogUndoLabel', title)
    : t('rules_autoLogUndoMoveLabel', title);
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
        {entries.map((entry) => (
          <li
            key={entry.id}
            data-testid="rule-auto-entry"
            data-kind={entry.kind}
            className="flex items-center gap-2 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm" title={entry.title}>
                {getBookmarkDisplayTitle(entry.title)}
              </p>
              <p className="truncate text-xs text-muted-foreground">{describeEntry(entry)}</p>
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
        ))}
      </ul>
    </section>
  );
}
