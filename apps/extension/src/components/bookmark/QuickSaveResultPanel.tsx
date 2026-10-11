/**
 * The last quick save, at the top of the popup, when the page it was made on could not show its
 * notification (browser pages, the extension store, the PDF viewer). Same content and actions as
 * the in-page notification, sent to the background the same way.
 */

import { CircleAlert, CircleCheck, Folder, Info, X } from 'lucide-react';
import { useState } from 'react';

const STATUS_ICONS = {
  saved: CircleCheck,
  duplicate: Info,
  removed: Info,
  failed: CircleAlert,
  saving: Info,
} as const;

export function QuickSaveResultPanel() {
  const { value: record } = useStoredValue(quickSaveRecordValue);
  const { settings } = useSettings();
  // Opening the popup decides whether the result is recent enough to show.
  const [openedAt] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  if (!record || !isQuickSaveForPopup(record, openedAt)) return null;

  const view = buildQuickSaveView(record, settings);
  const Icon = STATUS_ICONS[view.status];
  const send = async (message: QuickSaveActionMessage) => {
    setBusy(true);
    try {
      // The background updates the stored quick save, which re-renders this panel.
      await browser.runtime.sendMessage(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      data-testid="quick-save-result"
      aria-labelledby="quick-save-result-heading"
      className="shrink-0 space-y-2 border-b px-3 py-2"
    >
      <div className="flex items-start gap-2">
        <Icon
          aria-hidden="true"
          className={cn(
            'mt-0.5 size-4 shrink-0',
            view.status === 'saved'
              ? 'text-success'
              : view.status === 'failed'
                ? 'text-destructive-text'
                : 'text-muted-foreground',
          )}
        />
        <div role="status" className="min-w-0 flex-1">
          <h2 id="quick-save-result-heading" className="text-xs text-muted-foreground">
            {t('quickSave_lastTitle')}
          </h2>
          <p className="text-sm font-medium [overflow-wrap:anywhere]">{view.title}</p>
          {view.detail && (
            <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{view.detail}</p>
          )}
          {view.note && (
            <p
              className={cn(
                'mt-1 text-xs [overflow-wrap:anywhere]',
                view.status === 'failed' && 'text-destructive-text',
              )}
            >
              {view.note}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 text-muted-foreground"
          aria-label={view.dismissLabel}
          title={view.dismissLabel}
          onClick={() =>
            void send({ type: QUICK_SAVE_MESSAGE.action, id: view.id, action: 'dismiss' })
          }
        >
          <X className="size-3.5" />
        </Button>
      </div>
      {(view.actions.length > 0 || view.alternatives.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 pl-6">
          {view.actions.map((action) => (
            <Button
              key={action.id}
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                void send({ type: QUICK_SAVE_MESSAGE.action, id: view.id, action: action.id })
              }
            >
              {action.label}
            </Button>
          ))}
          {view.alternatives.length > 0 && (
            <span className="text-xs text-muted-foreground">{view.alternativesLabel}</span>
          )}
          {view.alternatives.map((alternative) => (
            <Button
              key={alternative.title}
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              className="h-6 gap-1.5 rounded-full px-2.5 text-xs font-normal"
              title={alternative.title}
              onClick={() =>
                void send({
                  type: QUICK_SAVE_MESSAGE.action,
                  id: view.id,
                  action: 'move',
                  index: alternative.index,
                })
              }
            >
              <Folder aria-hidden="true" className="size-3 text-muted-foreground" />
              <span className="max-w-[140px] truncate">{alternative.label}</span>
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
