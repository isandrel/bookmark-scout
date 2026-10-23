/**
 * Ask AI's approval of a bookmark change (`actionApproval` decides when one is needed). It shows
 * the change as Bookmark Scout will make it, as the action's `approvalPreview` describes it: for
 * a plan, the plan stored by `proposeChanges`, not the model's description of it. Titles and
 * paths are shown as plain text. Loaded with the chat (`AskAIPanel.lazy.tsx`), so it is left out of
 * auto-imports like every `*.lazy.tsx` file.
 */
import { ShieldAlert } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

type ApprovalProps = {
  toolName: string;
  input: unknown;
  /** `untrusted` when unreviewed text entered the chat before this request. */
  reason?: string;
  onRespond: (approved: boolean) => void;
};

/** What a call that names no stored record would do, from its unchecked input. */
function directLines(toolName: string, input: Record<string, unknown>): string[] {
  const lines = actionApprovalPreview(toolName)?.lines;
  return lines ? lines(input) : [describeActionCall(toolName, input) ?? toolName];
}

/**
 * What the request is about, read from storage: the stored record the call names (a plan, a
 * history entry), as the lines the user approves. undefined while it loads, null when it is gone
 * (expired, applied, or undone already), and none for a call that names no stored record.
 */
function useStoredChangeLines(toolName: string, args: Record<string, unknown>) {
  const stored = actionApprovalPreview(toolName)?.stored;
  const id = stored?.id(args) ?? '';
  const [loaded, setLoaded] = useState<ActionApprovalLines | null | undefined>(undefined);

  useEffect(() => {
    if (!stored || !id) return;
    let active = true;
    void stored
      .load(id)
      .catch(() => null)
      .then((found) => {
        if (active) setLoaded(found);
      });
    return () => {
      active = false;
    };
  }, [stored, id]);

  if (!stored || !id) return undefined;
  return { loaded, missingKey: stored.missingKey };
}

export function ActionApprovalRequest({ toolName, input, reason, onRespond }: ApprovalProps) {
  const headingId = useId();
  const args = isPlainObject(input) ? input : {};
  const stored = useStoredChangeLines(toolName, args);
  const [answered, setAnswered] = useState(false);

  const lines = stored ? (stored.loaded?.lines ?? []) : directLines(toolName, args);
  const summary = stored?.loaded?.summary;
  const missing = stored?.loaded === null;
  const url = actionApprovalPreview(toolName)?.url?.(args) ?? '';
  const respond = (approved: boolean) => {
    setAnswered(true);
    onRespond(approved);
  };

  return (
    <section
      aria-labelledby={headingId}
      data-testid="ask-ai-approval"
      className="space-y-2 rounded-md border bg-card px-3 py-2 text-sm"
    >
      <p id={headingId} className="flex items-center gap-1.5 font-medium">
        <ShieldAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-ai" />
        {t('askAI_approvalTitle')}
      </p>
      {summary && <p className="text-muted-foreground [overflow-wrap:anywhere]">{summary}</p>}
      {reason === 'untrusted' && (
        <p className="text-xs text-muted-foreground">{t('askAI_approvalUntrusted')}</p>
      )}
      {missing ? (
        <p className="text-xs text-muted-foreground">
          {t(stored?.missingKey ?? 'askAI_planMissing')}
        </p>
      ) : (
        <ul className="list-disc space-y-0.5 pl-5 [overflow-wrap:anywhere]">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {url && (
        <p data-slot="approval-url" className="break-all font-mono text-xs text-muted-foreground">
          {url}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={answered || missing || (stored !== undefined && stored.loaded === undefined)}
          onClick={() => respond(true)}
        >
          {t('askAI_approve')}
        </Button>
        <Button size="sm" variant="outline" disabled={answered} onClick={() => respond(false)}>
          {t('askAI_deny')}
        </Button>
      </div>
    </section>
  );
}
