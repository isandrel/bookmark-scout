/**
 * AI activity in Options: an opt-in log of recent AI provider calls with their request and
 * response bodies, for checking what a tool sent and why a call failed.
 */

import { ChevronRight, ClipboardCopy, Trash2 } from 'lucide-react';
import { useState } from 'react';

/** Pretty-prints JSON bodies; anything else is shown as is. */
function formatBody(body: string | undefined): string {
  if (!body) return '';
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function statusTone(entry: AIActivityEntry): string {
  if (entry.error || (entry.status ?? 0) >= 400) return 'bg-destructive-wash text-destructive-text';
  return 'bg-success-wash text-success';
}

function ActivityRow({ entry }: { entry: AIActivityEntry }) {
  const { toast } = useToast();
  const url = (() => {
    try {
      const parsed = new URL(entry.url);
      return `${parsed.host}${parsed.pathname}`;
    } catch {
      return entry.url;
    }
  })();

  const copy = async () => {
    await navigator.clipboard.writeText(
      JSON.stringify(
        {
          ...entry,
          requestBody: formatBody(entry.requestBody),
          responseBody: formatBody(entry.responseBody),
        },
        null,
        2,
      ),
    );
    toast({ title: t('aiActivity_copied') });
  };

  return (
    <li data-testid="ai-activity-entry">
      <details className="group/entry">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          <ChevronRight
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/entry:rotate-90"
          />
          <span
            className={cn(
              'shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-xs tabular-nums',
              statusTone(entry),
            )}
          >
            {entry.error ? t('aiActivity_failed') : entry.status}
          </span>
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">{t(AI_ACTIVITY_SOURCES[entry.source])}</span>
            <span className="text-muted-foreground">
              {` ${t('format_separator')} `}
              {entry.method} {url}
            </span>
          </span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {t('aiActivity_duration', String(entry.durationMs))}
          </span>
        </summary>
        <div className="space-y-3 border-t bg-background/40 px-3 py-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
            <span>
              {formatDateTime(entry.at)}
              {entry.model ? ` ${t('format_separator')} ${entry.provider} / ${entry.model}` : ''}
            </span>
            <Button variant="outline" size="sm" onClick={() => void copy()}>
              <ClipboardCopy className="h-4 w-4" />
              {t('aiActivity_copy')}
            </Button>
          </div>
          {entry.error && (
            <p role="alert" className="text-destructive-text">
              {entry.error}
            </p>
          )}
          {[
            {
              label: t('aiActivity_requestHeaders'),
              body: JSON.stringify(entry.requestHeaders, null, 2),
            },
            {
              label: t('aiActivity_request'),
              body: formatBody(entry.requestBody),
              omitted: entry.requestBodyOmitted,
            },
            {
              label: t('aiActivity_response'),
              body: formatBody(entry.responseBody),
              omitted: entry.responseBodyOmitted,
            },
          ].map(({ label, body, omitted }) =>
            body ? (
              <div key={label} className="space-y-1">
                <p className="font-medium text-foreground">{label}</p>
                <pre className="max-h-72 overflow-auto rounded-md border bg-card p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {body}
                </pre>
                {omitted ? (
                  <p className="text-muted-foreground">
                    {t('aiActivity_truncated', String(omitted))}
                  </p>
                ) : null}
              </div>
            ) : null,
          )}
        </div>
      </details>
    </li>
  );
}

export function AIActivityPanel() {
  const { entries, recording, setRecording } = useAIActivity();
  const [busy, setBusy] = useState(false);

  return (
    <section
      aria-labelledby="ai-activity-heading"
      className="space-y-3 rounded-lg border bg-card p-4"
      data-testid="ai-activity"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 id="ai-activity-heading" className="text-base font-medium">
            {t('aiActivity_title')}
          </h3>
          <p id="ai-activity-description" className="text-sm text-muted-foreground">
            {t('aiActivity_description', String(MAX_AI_ACTIVITY_ENTRIES))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="ai-activity-recording" className="text-sm">
            {t('aiActivity_record')}
          </Label>
          <Switch
            id="ai-activity-recording"
            checked={recording}
            disabled={busy}
            aria-describedby="ai-activity-description"
            onCheckedChange={(checked) => {
              setBusy(true);
              void setRecording(checked).finally(() => setBusy(false));
            }}
          />
        </div>
      </div>

      {recording && entries.length === 0 && (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          {t('aiActivity_empty')}
        </p>
      )}
      {entries.length > 0 && (
        <>
          <ul className="divide-y overflow-hidden rounded-md border">
            {entries.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} />
            ))}
          </ul>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => void clearAIActivity()}>
              <Trash2 className="h-4 w-4" />
              {t('aiActivity_clear')}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
