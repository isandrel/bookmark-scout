/**
 * How agents change bookmarks in bulk: `proposeChanges` checks a list of moves, renames,
 * deletions, and new folders against the library and stores it as a plan; `applyChanges` applies
 * a stored plan once the user approved it. The approval shows the plan as stored here, never the
 * model's own account of it, and applying skips any item changed since the plan was made. A plan
 * is one undo step (`undoChange` with the change id `applyChanges` returns, or Ctrl+Z in the
 * manager).
 *
 * Plans live in session storage, shared by every page and the background; they expire, and only
 * the newest few are kept (`config/ai/actions.toml`).
 */
import { z } from 'zod';

const plannedOperationSchema = z.object({
  action: z.enum(['moveBookmarks', 'renameBookmark', 'deleteBookmarks', 'createFolder']),
  input: z.record(z.string(), z.unknown()),
});

const planSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  /** Who proposed it: `askAI`, or a local agent's name. */
  client: z.string(),
  summary: z.string(),
  operations: z.array(plannedOperationSchema).min(1),
  preview: z.array(
    z.object({
      kind: z.enum(['move', 'rename', 'delete', 'createFolder']),
      title: z.string(),
      from: z.string().optional(),
      to: z.string().optional(),
      contains: z.number().int().optional(),
    }),
  ),
  expect: z.array(
    z.object({
      id: z.string(),
      parentId: z.string().optional(),
      title: z.string(),
      url: z.string().optional(),
    }),
  ),
});

export type ActionPlan = z.infer<typeof planSchema>;

export const actionPlansValue = defineStoredValue<ActionPlan[]>(STORAGE_ITEMS.actionPlans, {
  schema: z.array(planSchema),
  empty: [],
  isEmpty: (plans) => plans.length === 0,
});

const PLAN_TTL_MS = actionLimits.plan_ttl_minutes * 60_000;

function clientName(client: ActionClient): string {
  return client.kind === 'askAI' ? 'askAI' : client.name;
}

function isLive(plan: ActionPlan, now: number): boolean {
  return now - plan.createdAt < PLAN_TTL_MS;
}

/** A stored plan that has not expired, for the approval to show. */
export async function getActionPlan(id: string, now = Date.now()): Promise<ActionPlan | undefined> {
  const plan = (await actionPlansValue.get()).find((candidate) => candidate.id === id);
  return plan && isLive(plan, now) ? plan : undefined;
}

/** Removes a plan, applied or no longer wanted. */
export async function removeActionPlan(id: string): Promise<void> {
  await actionPlansValue.update((plans) => plans.filter((plan) => plan.id !== id));
}

/** The plannable change each kind of operation runs. */
const PLANNABLE = PLANNABLE_ACTIONS as Record<
  z.infer<typeof plannedOperationSchema>['action'],
  ActionDefinition<unknown, unknown>
>;

const operationInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('moveBookmarks'), input: PLANNABLE_ACTIONS.moveBookmarks.input }),
  z.object({ action: z.literal('renameBookmark'), input: PLANNABLE_ACTIONS.renameBookmark.input }),
  z.object({
    action: z.literal('deleteBookmarks'),
    input: PLANNABLE_ACTIONS.deleteBookmarks.input,
  }),
  z.object({ action: z.literal('createFolder'), input: PLANNABLE_ACTIONS.createFolder.input }),
]);

const previewOutput = planSchema.shape.preview;

const proposeChanges = defineAction({
  risk: 'read',
  labelKey: 'actionName_proposeChanges',
  targets: ['bookmark', 'folder'],
  agent: {
    description:
      'Propose bookmark changes for the user to approve: moves (optionally into a new folder), ' +
      'renames, deletions, and new folders, checked against the library now. Nothing changes ' +
      'yet. Returns a planId and the changes as the user will see them; then call applyChanges ' +
      'with the planId, which asks the user. Folders are named by ref or full path.',
    partOfChanges: true,
  },
  input: z.object({
    summary: z.string().trim().min(1).max(200).describe('One short sentence on what this does'),
    changes: z.array(operationInput).min(1).max(actionLimits.max_plan_operations),
  }),
  output: z.object({ planId: z.string(), changes: previewOutput, deletes: z.number().int() }),
  describe: () => t('askAI_toolPropose'),
  async execute(input, context) {
    const library = await loadActionLibrary();
    const preview: ActionPlan['preview'] = [];
    const expect: ActionPlan['expect'] = [];
    let deletes = 0;
    for (const [index, change] of input.changes.entries()) {
      const planned = PLANNABLE[change.action].plan?.(change.input, library);
      if (!planned || isActionError(planned)) {
        const problem = planned?.error;
        return actionError(
          problem?.code ?? 'invalid_input',
          `Change ${index + 1}: ${problem?.message}`,
          {
            ...(problem?.hint ? { hint: problem.hint } : {}),
            ...(problem?.candidates ? { candidates: problem.candidates } : {}),
          },
        );
      }
      preview.push(...planned.preview);
      expect.push(...planned.expect);
      deletes += planned.deletes ?? 0;
    }
    if (deletes > actionLimits.max_plan_deleted_bookmarks) {
      return actionError('too_large', `The plan deletes ${deletes} bookmarks.`, {
        hint: `Delete at most ${actionLimits.max_plan_deleted_bookmarks} per plan.`,
      });
    }
    const now = Date.now();
    const plan: ActionPlan = {
      id: globalThis.crypto.randomUUID(),
      createdAt: now,
      client: clientName(context.client),
      summary: input.summary,
      operations: input.changes,
      preview,
      expect,
    };
    await actionPlansValue.update((plans) =>
      [...plans.filter((stored) => isLive(stored, now)), plan].slice(-actionLimits.max_plans),
    );
    return { planId: plan.id, changes: preview, deletes };
  },
});

/** Whether each item the plan expects is still as it was when the plan was made. */
async function changedSince(plan: ActionPlan): Promise<Set<string>> {
  const changed = new Set<string>();
  for (const expected of plan.expect) {
    const live = await getLiveBookmark(expected.id);
    if (
      !live ||
      live.title !== expected.title ||
      live.parentId !== expected.parentId ||
      (live.url ?? undefined) !== expected.url
    ) {
      changed.add(expected.id);
    }
  }
  return changed;
}

/** What an agent is told when the plan it names is gone: it has to propose the changes again. */
function planGone(planId: string): ActionError {
  return actionError(
    'not_found',
    `Plan ${planId} does not exist, expired, or was already applied; call proposeChanges again.`,
    { hint: 'Propose the changes again with proposeChanges, then apply the new planId.' },
  );
}

/** The live plan `planId` names for this client, or why it cannot be applied as it is now. */
async function applicablePlan(
  planId: string,
  client: ActionClient,
): Promise<ActionPlan | ActionError> {
  const plan = await getActionPlan(planId);
  if (!plan || plan.client !== clientName(client)) return planGone(planId);
  const changed = await changedSince(plan);
  if (changed.size === 0) return plan;
  const titles = plan.expect
    .filter((item) => changed.has(item.id))
    .map((item) => `"${item.title}"`)
    .slice(0, actionLimits.max_candidates);
  return actionError(
    'unavailable',
    `Plan ${planId} is out of date: ${titles.join(', ')} changed since it was proposed; ` +
      'call proposeChanges again.',
    { hint: 'Look the items up again, then propose the changes again.' },
  );
}

/** The history entry's label: the kind of change when all are alike, else "N changes". */
function planLabel(plan: ActionPlan): BookmarkHistoryLabel {
  const kinds = new Set(plan.operations.map((operation) => operation.action));
  const labels: Record<string, BookmarkHistoryLabel['action']> = {
    moveBookmarks: 'move',
    renameBookmark: 'edit',
    deleteBookmarks: 'delete',
    createFolder: 'add',
  };
  const [only] = kinds;
  return kinds.size === 1 && only
    ? { action: labels[only], count: plan.preview.length }
    : { action: 'change', title: plan.summary, count: plan.preview.length };
}

const applyChanges = defineAction({
  risk: 'destructive',
  labelKey: 'actionName_applyChanges',
  targets: ['bookmark', 'folder'],
  agent: {
    description:
      'Apply a plan from proposeChanges. The user is always asked first and sees the plan; if ' +
      'they decline, do not try again. A plan is applied once; one that expired, was applied, ' +
      'or names items changed since is refused at once, so propose again. Items that change ' +
      'while the user decides are skipped. Returns a change id for undoChange.',
  },
  input: z.object({ planId: z.string().min(1) }),
  output: z.object({
    change: z.string().optional(),
    applied: z.number().int(),
    skipped: z.array(z.string()).describe('Titles left alone because they changed since'),
    failed: z.array(z.string()),
  }),
  describe: () => t('askAI_toolApply'),
  async precheck(input, context) {
    const plan = await applicablePlan(input.planId, context.client);
    return isActionError(plan) ? plan : undefined;
  },
  async execute(input, context) {
    const plan = await getActionPlan(input.planId);
    if (!plan || plan.client !== clientName(context.client)) return planGone(input.planId);
    const changed = await changedSince(plan);
    const skipped: string[] = [];
    const failed: string[] = [];
    let applied = 0;
    const { recorded } = await recordBookmarkWrites(planLabel(plan), async (writer) => {
      for (const operation of plan.operations) {
        const action = PLANNABLE[operation.action];
        const own = action.plan?.(operation.input, await loadActionLibrary());
        const ids = own && !isActionError(own) ? own.expect.map((item) => item.id) : [];
        const title =
          own && !isActionError(own)
            ? own.preview.map((line) => line.title).join(', ')
            : operation.action;
        if (!own || isActionError(own) || ids.some((id) => changed.has(id))) {
          skipped.push(title);
          continue;
        }
        const result = await action.execute?.(operation.input, { ...context, writer });
        if (!result || isActionError(result)) failed.push(title);
        else applied += 1;
      }
    });
    await removeActionPlan(plan.id);
    return {
      ...(recorded?.stored ? { change: recorded.entry.id } : {}),
      applied,
      skipped,
      failed,
    };
  },
});

export const PLAN_ACTIONS = { proposeChanges, applyChanges };
