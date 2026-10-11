/**
 * Whether the background's bridge for local AI agents (`services/agent-bridge.ts`) is running,
 * which Options shows, and the message Options sends it.
 */
import { z } from 'zod';

export const AGENT_BRIDGE_STATES = [
  'off',
  'connecting',
  'ready',
  'notInstalled',
  'failed',
] as const;

export type AgentBridgeState = (typeof AGENT_BRIDGE_STATES)[number];

const statusSchema = z.object({
  state: z.enum(AGENT_BRIDGE_STATES),
  /** The browser's reason when the bridge program could not start or stopped. */
  detail: z.string().max(500).optional(),
});

export type AgentBridgeStatus = z.infer<typeof statusSchema>;

export const agentBridgeStatusValue = defineStoredValue<AgentBridgeStatus>(
  STORAGE_ITEMS.agentBridgeStatus,
  { schema: statusSchema, empty: { state: 'off' }, isEmpty: (status) => status.state === 'off' },
);

const approvalSchema = z.object({
  /** The call's id, as the bridge numbered it. */
  id: z.string(),
  /** The name the agent gave itself; not verified. */
  client: z.string(),
  tool: z.string(),
  input: z.record(z.string(), z.unknown()),
  at: z.number(),
});

export type AgentApprovalRequest = z.infer<typeof approvalSchema>;

/** Changes local agents asked to make, waiting in the approval window (`services/agent-approvals.ts`). */
export const agentApprovalsValue = defineStoredValue<AgentApprovalRequest[]>(
  STORAGE_ITEMS.agentApprovals,
  { schema: z.array(approvalSchema), empty: [], isEmpty: (requests) => requests.length === 0 },
);

/** The extension page that lists them. */
export const AGENT_APPROVAL_PATH = '/agent-approval.html';

/** Messages extension pages send the background about the bridge. */
export const AGENT_BRIDGE_MESSAGE = {
  /** Try to start the bridge again now, such as right after installing it. */
  retry: 'agent-bridge/retry',
  /** The user approved or declined a request: `{ id, approved }`. */
  answer: 'agent-bridge/answer',
} as const;
