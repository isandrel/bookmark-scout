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

/** Messages Options sends the background about the bridge. */
export const AGENT_BRIDGE_MESSAGE = {
  /** Try to start the bridge again now, such as right after installing it. */
  retry: 'agent-bridge/retry',
} as const;
