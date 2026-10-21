/**
 * The user's approval of each change a local AI agent asks for. A request waits in session
 * storage (`agentApprovalsValue`), the approval window (`agent-approval.html`) opens or comes to the
 * front, and the toolbar badge counts what waits. The answer, a timeout, the agent giving up, or
 * the window being closed settles it; nothing is changed without an explicit approval.
 */
import { z } from 'zod';

const approvalConfig = readConfig(
  'ai/agent-approvals',
  z.strictObject({
    timeout_seconds: z.number().positive(),
    max_pending: z.number().int().positive(),
    window_width: z.number().int().positive(),
    window_height: z.number().int().positive(),
    badge_color: z.string().regex(/^#[0-9a-f]{6}$/i),
  }),
);

export type ApprovalOutcome = 'approved' | 'declined' | 'expired' | 'cancelled' | 'busy';

const waiting = new Map<
  string,
  { resolve: (outcome: ApprovalOutcome) => void; timer: ReturnType<typeof setTimeout> }
>();
let windowId: number | undefined;

async function showCount(): Promise<void> {
  const action = toolbarAction();
  try {
    await action?.setBadgeBackgroundColor({ color: approvalConfig.badge_color });
    await action?.setBadgeText({ text: waiting.size > 0 ? String(waiting.size) : '' });
  } catch {
    // The badge is a hint; the window is what asks.
  }
}

async function showWindow(): Promise<void> {
  if (windowId !== undefined) {
    try {
      await browser.windows.update(windowId, { focused: true });
      return;
    } catch {
      windowId = undefined;
    }
  }
  const created = await browser.windows.create({
    url: browser.runtime.getURL(AGENT_APPROVAL_PATH),
    type: 'popup',
    width: approvalConfig.window_width,
    height: approvalConfig.window_height,
    focused: true,
  });
  windowId = created?.id;
}

async function settle(id: string, outcome: ApprovalOutcome): Promise<void> {
  const entry = waiting.get(id);
  if (!entry) return;
  waiting.delete(id);
  clearTimeout(entry.timer);
  entry.resolve(outcome);
  await agentApprovalsValue
    .update((requests) => requests.filter((request) => request.id !== id))
    .catch(() => undefined);
  await showCount();
  if (waiting.size === 0 && windowId !== undefined) {
    const closing = windowId;
    windowId = undefined;
    await browser.windows.remove(closing).catch(() => undefined);
  }
}

/** Asks the user about one change and resolves with their answer, or why there was none. */
export async function requestAgentApproval(
  request: Omit<AgentApprovalRequest, 'at'>,
): Promise<ApprovalOutcome> {
  if (waiting.size >= approvalConfig.max_pending || waiting.has(request.id)) return 'busy';
  const outcome = new Promise<ApprovalOutcome>((resolve) => {
    const timer = setTimeout(
      () => void settle(request.id, 'expired'),
      approvalConfig.timeout_seconds * MS_PER_SECOND,
    );
    waiting.set(request.id, { resolve, timer });
  });
  await agentApprovalsValue.update((requests) => [...requests, { ...request, at: Date.now() }]);
  await showCount();
  await showWindow().catch(() => undefined);
  return outcome;
}

/** The agent gave up on the call (cancelled, or the bridge stopped). */
export function cancelAgentApproval(id: string): void {
  void settle(id, 'cancelled');
}

/** Every request still waiting is cancelled, such as when the bridge disconnects. */
export function cancelAllAgentApprovals(): void {
  for (const id of [...waiting.keys()]) cancelAgentApproval(id);
}

const answerSchema = z.object({
  type: z.literal(AGENT_BRIDGE_MESSAGE.answer),
  id: z.string(),
  approved: z.boolean(),
});

/** Called once from the background, with the bridge. */
export function registerAgentApprovals(): void {
  // A worker that restarted has no call waiting for what an earlier one stored.
  void agentApprovalsValue.clear().catch(() => undefined);
  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    const answer = answerSchema.safeParse(message);
    const fromApprovalPage =
      sender.id === browser.runtime.id &&
      sender.url?.startsWith(browser.runtime.getURL(AGENT_APPROVAL_PATH));
    if (answer.success && fromApprovalPage) {
      void settle(answer.data.id, answer.data.approved ? 'approved' : 'declined');
    }
    return undefined;
  });
  // Closing the window declines whatever it still showed.
  browser.windows?.onRemoved.addListener((closed) => {
    if (closed !== windowId) return;
    windowId = undefined;
    for (const id of [...waiting.keys()]) void settle(id, 'declined');
  });
}
