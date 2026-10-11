/**
 * The one registry of bookmark tools for AI agents. Ask AI (`ai-agent.lazy.ts`) turns each entry
 * into an AI SDK tool, and the MCP bridge offers the same entries to local agents, so a tool is
 * defined, limited, and tested once. Entries come from the tables in `agent-read-tools.ts`; their
 * building blocks are in `agent-tool-kit.ts`.
 *
 * `runAgentTool` is the only way a call runs: it checks the input and whether the tool can run
 * here, never throws (a tool that cannot act answers with an `AgentToolError` the model can read
 * and act on), and refuses a result too large to send.
 */
import { z } from 'zod';

export const AGENT_TOOLS = { ...READ_AGENT_TOOLS };

export type AgentToolName = keyof typeof AGENT_TOOLS;

/** Every tool's name, in registry order. */
export const AGENT_TOOL_NAMES = Object.keys(AGENT_TOOLS) as AgentToolName[];

export function isAgentToolName(name: string): name is AgentToolName {
  return Object.hasOwn(AGENT_TOOLS, name);
}

/** One entry with its types erased, for code that handles every tool the same way. */
export function getAgentTool(name: AgentToolName): AgentToolDefinition<unknown, unknown> {
  // Each entry's input and output types are checked where it is defined; here they are opaque.
  return AGENT_TOOLS[name] as unknown as AgentToolDefinition<unknown, unknown>;
}

/** The names of the tools this context can run, so a model is only offered those. */
export async function availableAgentToolNames(
  context: AgentToolContext,
): Promise<AgentToolName[]> {
  const blocked = await Promise.all(
    AGENT_TOOL_NAMES.map((name) => getAgentTool(name).unavailable?.(context)),
  );
  return AGENT_TOOL_NAMES.filter((_, index) => !blocked[index]);
}

/**
 * Runs one call. Input is checked against the tool's schema first (a local agent's arguments are
 * not checked by anything else), then whether the tool can run in this context.
 */
export async function runAgentTool(
  name: string,
  input: unknown,
  context: AgentToolContext,
): Promise<unknown> {
  if (!isAgentToolName(name)) {
    return agentToolError('not_found', `There is no tool named ${name}.`);
  }
  const tool = getAgentTool(name);
  const parsed = tool.input.safeParse(input ?? {});
  if (!parsed.success) {
    return agentToolError('invalid_input', z.prettifyError(parsed.error));
  }
  const blocked = await tool.unavailable?.(context);
  if (blocked) return blocked;
  let result: unknown;
  try {
    result = await tool.execute(parsed.data, context);
  } catch (error) {
    return agentToolError('failed', getErrorMessage(error));
  }
  if (!isAgentToolError(result)) {
    const size = JSON.stringify(result).length;
    if (size > agentToolsConfig.max_result_chars) {
      return agentToolError('too_large', `The result is too large to send (${size} characters).`, {
        hint: 'Ask for less: narrow the search, start under a folder, or pass fewer refs.',
      });
    }
  }
  return result;
}

/** The step the chat shows for a call, or undefined for a name that is not a registry tool. */
export function describeAgentToolCall(name: string, input: unknown): string | undefined {
  if (!isAgentToolName(name)) return undefined;
  return getAgentTool(name).describe(isPlainObject(input) ? input : {});
}
