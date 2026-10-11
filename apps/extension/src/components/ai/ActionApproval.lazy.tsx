/**
 * Ask AI's approval of a bookmark change (`actionApproval` decides when one is needed). It shows
 * the change as Bookmark Scout will make it: for a plan, the plan stored by `proposeChanges`, not
 * the model's description of it. Titles and paths are shown as plain text. Loaded with the chat
 * (`AskAIPanel.lazy.tsx`), so it is left out of auto-imports like every `*.lazy.tsx` file.
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

const quoted = (title: string) => getBookmarkDisplayTitle(title);

type PlanLine = ActionPlan['preview'][number];

/** The line each kind of planned change shows, in the user's language. */
const PLAN_LINES: Record<PlanLine['kind'], (line: PlanLine) => string> = {
  move: (line) => t('askAI_planMove', [quoted(line.title), line.from ?? '', line.to ?? '']),
  rename: (line) => t('askAI_planRename', [quoted(line.title), line.to ?? '']),
  delete: (line) =>
    line.contains
      ? t('askAI_planDeleteFolder', [quoted(line.title), line.from ?? '', String(line.contains)])
      : t('askAI_planDelete', [quoted(line.title), line.from ?? '']),
  createFolder: (line) => t('askAI_planCreateFolder', [line.title, line.to ?? '']),
};

function planLines(plan: ActionPlan): string[] {
  return plan.preview.map((line) => PLAN_LINES[line.kind](line));
}

/** What a direct write (not a plan) would do, from its checked input. */
function directLines(toolName: string, input: Record<string, unknown>): string[] {
  if (toolName === 'saveBookmark') {
    const folder = [input.folder, input.newFolder].filter(Boolean).join(AI_FOLDER_PATH_SEPARATOR);
    return [t('askAI_approvalSave', [String(input.title || input.url || ''), folder])];
  }
  if (toolName === 'undoChange') return [t('askAI_approvalUndo')];
  return [describeActionCall(toolName, input) ?? toolName];
}

export function ActionApprovalRequest({ toolName, input, reason, onRespond }: ApprovalProps) {
  const headingId = useId();
  const args = isPlainObject(input) ? input : {};
  const planId = toolName === 'applyChanges' && typeof args.planId === 'string' ? args.planId : '';
  // undefined while the plan loads, null when it expired or was applied.
  const [plan, setPlan] = useState<ActionPlan | null | undefined>(undefined);
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    if (!planId) return;
    let active = true;
    void getActionPlan(planId).then((found) => {
      if (active) setPlan(found ?? null);
    });
    return () => {
      active = false;
    };
  }, [planId]);

  const lines = planId ? (plan ? planLines(plan) : []) : directLines(toolName, args);
  const missing = Boolean(planId) && plan === null;
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
      {plan?.summary && (
        <p className="text-muted-foreground [overflow-wrap:anywhere]">{plan.summary}</p>
      )}
      {reason === 'untrusted' && (
        <p className="text-xs text-muted-foreground">{t('askAI_approvalUntrusted')}</p>
      )}
      {missing ? (
        <p className="text-xs text-muted-foreground">{t('askAI_planMissing')}</p>
      ) : (
        <ul className="list-disc space-y-0.5 pl-5 [overflow-wrap:anywhere]">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={answered || missing || (Boolean(planId) && plan === undefined)}
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
