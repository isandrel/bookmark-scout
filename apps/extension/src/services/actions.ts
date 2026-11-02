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
 * the caller can read and act on); and it refuses a result too large to send. The user's own
 * pages call it too, as the `ui` client, so a feature is one action for people and agents alike.
 *
 * `runBatch` is the one aggregate: several calls as one request, one approval, one undo step. It
 * lives here, not in a table, because it runs other entries of this registry.
 */
import { z } from 'zod';

type BatchStep = { action: string; input?: Record<string, unknown> };

const batchInput = z.object({
  steps: z
    .array(
      z.object({
        action: z.string().min(1).describe(agentText('run_batch.step_action')),
        input: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(agentText('run_batch.step_input')),
      }),
    )
    .min(1)
    .max(actionLimits.max_batch_steps)
    .describe(agentText('run_batch.steps')),
});

const runBatch = defineAction({
  risk: 'write',
  batch: false,
  labelKey: 'actionName_runBatch',
  targets: ['library'],
  agent: { description: agentText('run_batch.agent_description') },
  input: batchInput,
  output: z.object({
    results: z
      .array(z.object({ action: z.string(), result: z.unknown() }))
      .describe(agentText('run_batch.results')),
    failedAt: z.number().int().optional().describe(agentText('run_batch.failed_at')),
    change: z.string().optional().describe(agentText('run_batch.change')),
  }),
  describe: (input) => t('askAI_toolBatch', formatCount(input.steps?.length ?? 0)),
  approvalPreview: {
    lines: (input) =>
      (Array.isArray(input.steps) ? input.steps : []).map(
        (step: BatchStep) => describeActionCall(step.action, step.input ?? {}) ?? step.action,
      ),
  },
  precheck: (input, context) => checkBatch(input.steps, context),
  async execute(input, context) {
    const refused = await checkBatch(input.steps, context);
    if (refused) return refused;
    const results: { action: string; result: unknown }[] = [];
    let failedAt: number | undefined;
    const run = async (writer?: BookmarkWriter) => {
      for (const [index, step] of input.steps.entries()) {
        const result = await runAction(step.action, step.input ?? {}, {
          ...context,
          ...(writer ? { writer } : {}),
        });
        results.push({ action: step.action, result });
        if (isActionError(result)) {
          failedAt = index;
          return;
        }
      }
    };
    const changes = input.steps.some(
      (step) => isActionId(step.action) && getAction(step.action).risk !== 'read',
    );
    if (!changes) {
      await run();
      return { results, ...(failedAt === undefined ? {} : { failedAt }) };
    }
    // Every change of the batch is one undo step, as a plan's are.
    const { recorded } = await recordBookmarkWrites(
      { action: 'change', count: input.steps.length },
      (writer) => run(context.writer ?? writer),
    );
    return {
      results,
      ...(failedAt === undefined ? {} : { failedAt }),
      ...(recorded?.stored ? { change: recorded.entry.id } : {}),
    };
  },
});

/** Why a batch would be refused before any step runs: an unknown step, one that cannot be a step, or one this caller may not run. */
async function checkBatch(
  steps: readonly BatchStep[],
  context: ActionContext,
): Promise<ActionError | undefined> {
  for (const [index, step] of steps.entries()) {
    if (isActionId(step.action) && getAction(step.action).batch === false) {
      return actionError(
        'not_allowed',
        `Step ${index + 1}: ${step.action} cannot be part of a batch.`,
        {
          hint: 'Call it on its own.',
        },
      );
    }
    const problem = await checkActionCall(step.action, step.input ?? {}, context);
    if (problem) {
      return {
        error: { ...problem.error, message: `Step ${index + 1}: ${problem.error.message}` },
      };
    }
  }
  return undefined;
}

export const ACTIONS = {
  ...READ_ACTIONS,
  ...ITEM_ACTIONS,
  ...WRITE_ACTIONS,
  ...PLAN_ACTIONS,
  ...CHAT_ACTIONS,
  ...SETTINGS_ACTIONS,
  ...METADATA_ACTIONS,
  ...JOB_ACTIONS,
  runBatch,
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
function offeredTo(id: ActionId, kind: AgentKind): boolean {
  const { agent } = getAction(id);
  return Boolean(agent && (!agent.only || agent.only === kind));
}

/** The actions the user can turn on or off for this kind of agent (Options > AI for Ask AI, Options > For developers for local agents). */
export function agentActionChoices(kind: AgentKind): ActionId[] {
  return ACTION_IDS.filter((id) => offeredTo(id, kind));
}

/** The setting listing the actions the user turned off for each kind of agent. */
const DISABLED_ACTIONS = {
  askAI: 'askAiDisabledActions',
  external: 'agentBridgeDisabledActions',
} as const satisfies Record<AgentKind, keyof Settings>;

/** Why the agent making the call may not use this action, or nothing. */
function refusedFor(id: ActionId, context: ActionContext): string | undefined {
  const { kind } = context.client;
  // The user in Bookmark Scout's own pages may run any action; the agent settings limit agents.
  if (kind === 'ui') return undefined;
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

type PreparedCall = {
  action: ActionDefinition<unknown, unknown> & ActionCall<unknown, unknown>;
  input: unknown;
};

/**
 * The checks every call passes before it runs: the action exists and may be called, this agent
 * may use it, the input fits its schema (a local agent's arguments are not checked by anything
 * else), and it can run in this context.
 */
async function prepareCall(
  id: string,
  input: unknown,
  context: ActionContext,
): Promise<PreparedCall | ActionError> {
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
  return { action: action as PreparedCall['action'], input: parsed.data };
}

/**
 * Why a call would be refused or fail right now, without running it: the checks `runAction`
 * makes first, then the action's own `precheck` (a plan that no longer exists). A caller that asks
 * the user before a call checks this first, so nobody is asked to approve a call that cannot work.
 */
export async function checkActionCall(
  id: string,
  input: unknown,
  context: ActionContext,
): Promise<ActionError | undefined> {
  const prepared = await prepareCall(id, input, context);
  if (isActionError(prepared)) return prepared;
  try {
    return await prepared.action.precheck?.(prepared.input, context);
  } catch (error) {
    return actionError('failed', getErrorMessage(error));
  }
}

/** Runs one call, after the checks in `prepareCall`. */
export async function runAction(
  id: string,
  input: unknown,
  context: ActionContext,
): Promise<unknown> {
  const prepared = await prepareCall(id, input, context);
  if (isActionError(prepared)) return prepared;
  const { action } = prepared;
  const parsed = { data: prepared.input };
  const started = performance.now();
  let result: unknown;
  try {
    result = await action.execute(parsed.data, context);
  } catch (error) {
    result = actionError('failed', getErrorMessage(error));
  }
  // Every change, and every call a local agent makes, is in the AI activity log when it is on.
  // The user's own calls are not AI activity.
  const { client } = context;
  if (client.kind !== 'ui' && (action.risk !== 'read' || client.kind !== 'askAI')) {
    void recordActionActivity({
      source: client.kind === 'askAI' ? 'askAI' : 'agentBridge',
      ...(client.kind === 'external' ? { client: client.name } : {}),
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

/** Runs an action for the user in Bookmark Scout's own pages: the `ui` client, never throwing. */
export async function runUIAction(id: ActionId, input: unknown): Promise<unknown> {
  return runAction(id, input, {
    client: { kind: 'ui' },
    settings: await getSettings(),
    activeTab: activeTabPage,
  });
}

/** What the approval of a call shows beyond its `describe` line, or undefined (`approvalPreview`). */
export function actionApprovalPreview(id: string): ActionApprovalPreview<unknown> | undefined {
  return isActionId(id) ? getAction(id).approvalPreview : undefined;
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
  input: unknown,
  { untrustedContentSeen }: { untrustedContentSeen: boolean },
): 'none' | 'always' | 'untrusted' {
  if (!isActionId(id)) return 'none';
  const risk = callRisk(id, input);
  if (risk === 'destructive' || asksAlways(id, input)) return 'always';
  if (risk === 'write') return untrustedContentSeen ? 'untrusted' : 'none';
  return 'none';
}

const RISK_ORDER: readonly ActionRisk[] = ['read', 'write', 'destructive'];

/**
 * How much one call can change: its action's risk, or for `runBatch` the highest risk of its
 * steps, so a batch of lookups needs no approval and one with a deletion always does.
 */
export function callRisk(id: ActionId, input: unknown): ActionRisk {
  if (id !== 'runBatch') return getAction(id).risk;
  const parsed = batchInput.safeParse(input);
  if (!parsed.success) return getAction(id).risk;
  const risks = parsed.data.steps.map((step) =>
    isActionId(step.action) ? callRisk(step.action, step.input ?? {}) : 'read',
  );
  return risks.reduce<ActionRisk>(
    (highest, risk) => (RISK_ORDER.indexOf(risk) > RISK_ORDER.indexOf(highest) ? risk : highest),
    'read',
  );
}

/** Whether a call always asks: its action says so, or for `runBatch`, any of its steps' does. */
function asksAlways(id: ActionId, input: unknown): boolean {
  if (id !== 'runBatch') return Boolean(getAction(id).alwaysAsk);
  const parsed = batchInput.safeParse(input);
  return parsed.success
    ? parsed.data.steps.some(
        (step) => isActionId(step.action) && asksAlways(step.action, step.input ?? {}),
      )
    : false;
}

/** Actions whose results carry text nobody reviewed (`agent.untrusted`). */
export const UNTRUSTED_ACTION_IDS: ReadonlySet<string> = new Set(
  ACTION_IDS.filter((id) => getAction(id).agent?.untrusted),
);
