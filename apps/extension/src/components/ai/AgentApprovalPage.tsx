/**
 * The approval window for local AI agents (`agent-approval.html`): each change an agent asked to
 * make, shown as Bookmark Scout will make it, with Approve and Decline. The background opens it,
 * waits for the answer, and closes it when nothing is left (`services/agent-approvals.ts`).
 */
import { ActionApprovalRequest } from '@/components/ai/ActionApproval.lazy';

function answer(id: string, approved: boolean): void {
  void browser.runtime
    .sendMessage({ type: AGENT_BRIDGE_MESSAGE.answer, id, approved })
    .catch(() => undefined);
}

export function AgentApprovalPage() {
  const { value: requests, isLoading } = useStoredValue(agentApprovalsValue);

  return (
    <main className="mx-auto max-w-md space-y-3 bg-background p-4 text-foreground">
      <h1 className="text-lg font-semibold">{t('agentApproval_title')}</h1>
      <p className="text-sm text-muted-foreground">{t('agentApproval_desc')}</p>
      {!isLoading && requests.length === 0 && (
        <p role="status" className="text-sm">
          {t('agentApproval_none')}
        </p>
      )}
      {requests.map((request) => (
        <div key={request.id} data-testid="agent-approval" className="space-y-1">
          {/* The agent names itself; shown as plain text and marked as unverified. */}
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {t('agentApproval_from', request.client)}
          </p>
          <ActionApprovalRequest
            toolName={request.tool}
            input={request.input}
            onRespond={(approved) => answer(request.id, approved)}
          />
        </div>
      ))}
    </main>
  );
}
