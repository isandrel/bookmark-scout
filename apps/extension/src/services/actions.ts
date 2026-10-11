/**
 * The one registry of bookmark actions. Every surface takes its actions from here instead of
 * keeping its own list: Ask AI turns the entries with an `agent` exposure into its tools
 * (`ai-agent.lazy.ts`), the MCP bridge offers the same entries to local agents, and the bookmark
 * manager's menus show the entries `config/ui/actions.toml` lists (`action-menus.ts`). An entry is
 * defined, limited, and tested once; the entries come from the tables in `read-actions.ts`,
 * `item-actions.ts`, `write-actions.ts`, and `plan-actions.ts`, and their building blocks are in
 * `action-kit.ts`.
 *
 * How to add an action: add an entry to the table for its kind with its risk, targets, and
 * permission; a call (input and output schemas, `describe`, `execute`) and `agent` when AI may
 * call it; a label, icon, and `itemMenu` or `folderMenu` when a menu shows it, plus its id in
 * `config/ui/actions.toml`. Add its messages in every locale and test it in
 * `tests/unit/actions.test.ts` (calls) or `tests/unit/action-menus.test.ts` (menus).
 *
 * `runAction` is the only way a call runs: it checks the input, the permission, and whether the
 * action can run here; it never throws (an action that cannot act answers with an `ActionError`
 * the caller can read and act on); and it refuses a result too large to send.
 */
import { z } from 'zod';

export const ACTIONS = {
  ...READ_ACTIONS,
  ...ITEM_ACTIONS,
  ...WRITE_ACTIONS,
  ...PLAN_ACTIONS,
  ...CHAT_ACTIONS,
};

export type ActionId = keyof typeof ACTIONS;

/** Every action's id, in registry order. */
export const ACTION_IDS = Object.keys(ACTIONS) as ActionId[];

export function isActionId(id: string): id is ActionId {
  return Object.hasOwn(ACTIONS, id);
}

/** One entry with its types erased, for code that handles every action the same way. */
export function getAction(id: ActionId): ActionDefinition<unknown, unknown> {
  // Each entry's input and output types are checked where it is defined; here they are opaque.
  return ACTIONS[id] as unknown as ActionDefinition<unknown, unknown>;
}

/** Whether an action changes bookmarks, or exists to (proposing a plan), for agents and settings. */
export function changesBookmarks(id: ActionId): boolean {
  const action = getAction(id);
  return action.risk !== 'read' || Boolean(action.agent?.partOfChanges);
}

/** Whether this kind of agent is offered the action at all: it has an agent exposure for it. */
function offeredTo(id: ActionId, kind: ActionClient['kind']): boolean {
  const { agent } = getAction(id);
  return Boolean(agent && (!agent.only || agent.only === kind));
}

/** The actions the user can turn on or off for this kind of agent (Options > AI). */
export function agentActionChoices(kind: ActionClient['kind']): ActionId[] {
  return ACTION_IDS.filter((id) => offeredTo(id, kind));
}

/** The setting listing the actions the user turned off for each kind of agent. */
const DISABLED_ACTIONS = {
  askAI: 'askAiDisabledActions',
  external: 'agentBridgeDisabledActions',
} as const satisfies Record<ActionClient['kind'], keyof Settings>;

/** Why the agent making the call may not use this action, or nothing. */
function refusedFor(id: ActionId, context: ActionContext): string | undefined {
  const { kind } = context.client;
  if (!offeredTo(id, kind)) return `${id} is not offered to this agent.`;
  // Local agents change bookmarks only once the user allows it; each change still asks first.
  if (kind === 'external' && changesBookmarks(id) && !context.settings.agentBridgeWrites) {
    return 'The user has not allowed local agents to change bookmarks.';
  }
  return context.settings[DISABLED_ACTIONS[kind]].includes(id)
    ? `The user turned off ${id} for ${kind === 'askAI' ? 'Ask AI' : 'local agents'}.`
    : undefined;
}

/** Why `action` cannot run in `context` (a missing permission first), or nothing. */
async function whyUnavailable(
  action: ActionDefinition<unknown, unknown>,
  context: ActionContext,
): Promise<ActionError | undefined> {
  if (action.permission && !(await hasPermission(action.permission))) {
    return actionError('unavailable', 'Bookmark Scout is not allowed to do this yet.', {
      ...(PERMISSION_HINTS[action.permission] ? { hint: PERMISSION_HINTS[action.permission] } : {}),
    });
  }
  return action.unavailable?.(context);
}

/** The actions AI agents may call in this context, so a model is offered only those. */
export async function agentActionIds(context: ActionContext): Promise<ActionId[]> {
  const exposed = ACTION_IDS.filter(
    (id) => getAction(id).agent && getAction(id).execute && !refusedFor(id, context),
  );
  const blocked = await Promise.all(exposed.map((id) => whyUnavailable(getAction(id), context)));
  return exposed.filter((_, index) => !blocked[index]);
}

/**
 * Runs one call. Input is checked against the action's schema first (a local agent's arguments
 * are not checked by anything else), then whether the action can run in this context.
 */
export async function runAction(
  id: string,
  input: unknown,
  context: ActionContext,
): Promise<unknown> {
  if (!isActionId(id)) {
    return actionError('not_found', `There is no action named ${id}.`);
  }
  const action = getAction(id);
  if (!action.input || !action.execute) {
    return actionError('not_allowed', `${id} can only be used from a menu.`);
  }
  const refusal = refusedFor(id, context);
  if (refusal) return actionError('not_allowed', refusal);
  const parsed = action.input.safeParse(input ?? {});
  if (!parsed.success) {
    return actionError('invalid_input', z.prettifyError(parsed.error));
  }
  const blocked = await whyUnavailable(action, context);
  if (blocked) return blocked;
  const started = performance.now();
  let result: unknown;
  try {
    result = await action.execute(parsed.data, context);
  } catch (error) {
    result = actionError('failed', getErrorMessage(error));
  }
  // Every change, and every call a local agent makes, is in the AI activity log when it is on.
  if (action.risk !== 'read' || context.client.kind !== 'askAI') {
    void recordActionActivity({
      source: context.client.kind === 'askAI' ? 'askAI' : 'agentBridge',
      ...(context.client.kind === 'external' ? { client: context.client.name } : {}),
      action: id,
      input: parsed.data,
      result,
      durationMs: Math.round(performance.now() - started),
    });
  }
  if (isActionError(result)) return result;
  const size = JSON.stringify(result).length;
  if (size > actionLimits.max_result_chars) {
    return actionError('too_large', `The result is too large to send (${size} characters).`, {
      hint: 'Ask for less: narrow the search, start under a folder, or pass fewer refs.',
    });
  }
  return result;
}

/** What a call did, for the chat's steps, or undefined for an id that is not an action. */
export function describeActionCall(id: string, input: unknown): string | undefined {
  if (!isActionId(id)) return undefined;
  return getAction(id).describe?.(isPlainObject(input) ? input : {});
}

/**
 * Whether a call waits for the user's approval: `always` for a destructive action (applying a
 * plan, which can delete); `untrusted` for any other write once text nobody reviewed (a page,
 * a web search) has entered the conversation, since it may have steered the request; `none`
 * otherwise. Reads never wait. The check is here, in code, never left to the model.
 */
export function actionApproval(
  id: string,
  { untrustedContentSeen }: { untrustedContentSeen: boolean },
): 'none' | 'always' | 'untrusted' {
  if (!isActionId(id)) return 'none';
  const { risk } = getAction(id);
  if (risk === 'destructive') return 'always';
  if (risk === 'write') return untrustedContentSeen ? 'untrusted' : 'none';
  return 'none';
}

/** Actions whose results carry text nobody reviewed (`agent.untrusted`). */
export const UNTRUSTED_ACTION_IDS: ReadonlySet<string> = new Set(
  ACTION_IDS.filter((id) => getAction(id).agent?.untrusted),
);
