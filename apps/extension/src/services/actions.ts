/**
 * The one registry of bookmark actions. Every surface takes its actions from here instead of
 * keeping its own list: Ask AI turns the entries with an `agent` exposure into its tools
 * (`ai-agent.lazy.ts`), and the MCP bridge offers the same entries to local agents. An entry is
 * defined, limited, and tested once; the entries come from the tables in `read-actions.ts`, and
 * their building blocks are in `action-kit.ts`.
 *
 * How to add an action: add an entry (risk, targets, permission, input and output schemas,
 * `describe`, `execute`, and `agent` when AI may call it) to the table for its kind, add the
 * messages `describe` uses in every locale, and test it in `tests/unit/actions.test.ts`.
 *
 * `runAction` is the only way a call runs: it checks the input, the permission, and whether the
 * action can run here; it never throws (an action that cannot act answers with an `ActionError`
 * the caller can read and act on); and it refuses a result too large to send.
 */
import { z } from 'zod';

export const ACTIONS = { ...READ_ACTIONS };

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
  const exposed = ACTION_IDS.filter((id) => getAction(id).agent);
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
  const parsed = action.input.safeParse(input ?? {});
  if (!parsed.success) {
    return actionError('invalid_input', z.prettifyError(parsed.error));
  }
  const blocked = await whyUnavailable(action, context);
  if (blocked) return blocked;
  let result: unknown;
  try {
    result = await action.execute(parsed.data, context);
  } catch (error) {
    return actionError('failed', getErrorMessage(error));
  }
  if (!isActionError(result)) {
    const size = JSON.stringify(result).length;
    if (size > actionLimits.max_result_chars) {
      return actionError('too_large', `The result is too large to send (${size} characters).`, {
        hint: 'Ask for less: narrow the search, start under a folder, or pass fewer refs.',
      });
    }
  }
  return result;
}

/** What a call did, for the chat's steps, or undefined for an id that is not an action. */
export function describeActionCall(id: string, input: unknown): string | undefined {
  if (!isActionId(id)) return undefined;
  return getAction(id).describe(isPlainObject(input) ? input : {});
}
