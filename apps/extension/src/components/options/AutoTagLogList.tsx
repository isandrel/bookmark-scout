/**
 * Tagged automatically: under Smart Rules in Settings, what Tag New Bookmarks did lately
 * (`auto-tag-log.ts`), newest first, each with Undo, and Clear list. Shown once there is one.
 */
import { Undo2 } from 'lucide-react';

export function AutoTagLogList() {
  const { value: entries } = useStoredValue(autoTagLogValue);
  if (entries.length === 0) return null;

  const undo = async (id: string) => {
    try {
      const removed = await undoAutoTag(id);
      toast.success({
        title: t('rules_autoLogUndone'),
        description: tPlural('rules_autoLogUndoneDesc', removed),
      });
    } catch (error) {
      toast.error({ title: t('toast_toolFailed'), description: getErrorMessage(error) });
    }
  };

  return (
    <section data-testid="auto-tag-log" className="mt-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">{t('rules_autoLogTitle')}</h4>
        <Button size="sm" variant="ghost" onClick={() => void clearAutoTagLog()}>
          {t('rules_autoLogClear')}
        </Button>
      </div>
      <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
        {entries.map((entry) => (
          <li
            key={entry.id}
            data-testid="auto-tag-entry"
            className="flex items-center gap-2 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm" title={entry.title}>
                {getBookmarkDisplayTitle(entry.title)}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {t('rules_autoLogTags', [formatList(entry.tags), formatDateTime(entry.at)])}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              aria-label={t('rules_autoLogUndoLabel', getBookmarkDisplayTitle(entry.title))}
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
