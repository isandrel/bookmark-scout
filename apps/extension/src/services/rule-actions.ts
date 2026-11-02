/**
 * Smart Rules as actions, for agents and Bookmark Scout's own pages: listing the rules, saving a
 * new or changed one, and deleting one, through the rules' own storage and checks
 * (`bookmark-rules-storage.ts`, `bookmarkRuleSchema`). A rule can tag and move new bookmarks on
 * its own, so every save or delete an agent asks for waits for the user's approval (`alwaysAsk`);
 * moving new bookmarks without a review (`autoMove`) is only ever turned on by the user in Options.
 */
import { z } from 'zod';

/**
 * A rule as agents see it. Its folder is named by the path agents pass back (`/` between folder
 * names); the stored path is Options' display path, used only for a folder that is gone.
 */
const ruleView = (rule: BookmarkRule, library: ActionLibrary) => ({
  id: rule.id,
  name: rule.name,
  enabled: rule.enabled,
  query: rule.query,
  addTags: rule.addTags,
  ...(rule.moveTo
    ? { moveTo: library.folderById.get(rule.moveTo.folderId)?.path ?? rule.moveTo.path }
    : {}),
  ...(rule.autoMove ? { autoMove: true } : {}),
});

const ruleOutput = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  query: z.string(),
  addTags: z.array(z.string()),
  moveTo: z.string().optional().describe(agentText('rule_view.move_to')),
  autoMove: z.boolean().optional().describe(agentText('rule_view.auto_move')),
});

const ruleNotFound = actionError('not_found', 'There is no rule with this id.', {
  hint: 'Call listRules for the ids.',
});

const listRules = defineAction({
  risk: 'read',
  labelKey: 'actionName_listRules',
  targets: ['library'],
  agent: { description: agentText('list_rules.agent_description') },
  input: z.object({}),
  output: z.object({ rules: z.array(ruleOutput) }),
  describe: () => t('askAI_toolListRules'),
  async execute() {
    const [rules, library] = await Promise.all([bookmarkRulesValue.get(), loadActionLibrary()]);
    return { rules: rules.map((rule) => ruleView(rule, library)) };
  },
});

const saveRuleInput = z.object({
  id: z.string().min(1).optional().describe(agentText('save_rule.id')),
  name: z.string().trim().min(1).max(BOOKMARK_RULE_LIMITS.name_max_length),
  query: z.string().trim().min(1).describe(agentText('save_rule.query')),
  addTags: z
    .array(z.string().trim().min(1).max(BOOKMARK_RULE_LIMITS.tag_max_length))
    .max(BOOKMARK_RULE_LIMITS.max_tags)
    .default([])
    .describe(agentText('save_rule.add_tags')),
  moveTo: z.string().min(1).optional().describe(agentText('save_rule.move_to')),
  enabled: z.boolean().default(true),
  autoMove: z.boolean().optional().describe(agentText('save_rule.auto_move')),
});

type SaveRuleInput = z.infer<typeof saveRuleInput>;

const autoMoveRefused = actionError(
  'not_allowed',
  'Only the user turns on moving new bookmarks without a review, in Options.',
  { hint: 'Leave autoMove out; the rule still moves what a reviewed run approves.' },
);

/**
 * The rule a save would store, or why it cannot: a rule it names that is gone, a folder, a check.
 * The user sets `autoMove` in Options (the `ui` client); an agent's save keeps it as the user
 * set it, for the same folder only.
 */
async function ruleToSave(
  input: SaveRuleInput,
  client: ActionClient,
): Promise<BookmarkRule | ActionError> {
  const byUser = client.kind === 'ui';
  if (input.autoMove && !byUser) return autoMoveRefused;
  const existing = input.id
    ? (await bookmarkRulesValue.get()).find((rule) => rule.id === input.id)
    : undefined;
  if (input.id && !existing) return ruleNotFound;
  let moveTo: BookmarkRule['moveTo'];
  if (input.moveTo) {
    const library = await loadActionLibrary();
    const folder = resolveActionFolder(library, input.moveTo);
    if (isActionError(folder)) return folder;
    // The path as Options shows and checks it, the same for a rule saved there.
    const path = ruleFolderPath(library.tree, folder.node.id);
    if (path === undefined) {
      return actionError('not_allowed', `${folder.path} cannot hold new bookmarks.`, {
        hint: 'Choose a folder you can add bookmarks to.',
      });
    }
    moveTo = { folderId: folder.node.id, path };
  }
  const parsed = bookmarkRuleSchema.safeParse({
    id: existing?.id ?? createBookmarkRuleId(),
    name: input.name,
    enabled: input.enabled,
    query: input.query,
    syntaxVersion: SEARCH_SYNTAX_VERSION,
    addTags: input.addTags,
    ...(moveTo ? { moveTo } : {}),
    ...((
      byUser
        ? input.autoMove && moveTo
        : existing?.autoMove && moveTo?.folderId === existing.moveTo?.folderId
    )
      ? { autoMove: true }
      : {}),
  });
  if (!parsed.success) return actionError('invalid_input', z.prettifyError(parsed.error));
  return parsed.data;
}

const saveRule = defineAction({
  risk: 'write',
  alwaysAsk: true,
  labelKey: 'actionName_saveRule',
  targets: ['library'],
  agent: { description: agentText('save_rule.agent_description') },
  input: saveRuleInput,
  output: ruleOutput,
  describe: (input) => t('askAI_toolSaveRule', input.name ?? ''),
  approvalPreview: {
    lines: (input) => [
      t('askAI_approvalRule', [input.name ?? '', input.query ?? '']),
      ...(input.addTags?.length ? [t('askAI_approvalRuleTags', input.addTags.join(', '))] : []),
      ...(input.moveTo ? [t('askAI_approvalRuleMove', input.moveTo)] : []),
    ],
  },
  async precheck(input, context) {
    const rule = await ruleToSave(input, context.client);
    return isActionError(rule) ? rule : undefined;
  },
  async execute(input, context) {
    const rule = await ruleToSave(input, context.client);
    if (isActionError(rule)) return rule;
    try {
      await saveBookmarkRule(rule);
    } catch (error) {
      if (error instanceof BookmarkRuleLimitError) {
        return actionError('not_allowed', `At most ${MAX_BOOKMARK_RULES} rules can be saved.`, {
          hint: 'Delete one first, or ask the user which to keep.',
        });
      }
      throw error;
    }
    return ruleView(rule, await loadActionLibrary());
  },
});

const deleteRule = defineAction({
  risk: 'write',
  alwaysAsk: true,
  labelKey: 'actionName_deleteRule',
  targets: ['library'],
  agent: { description: agentText('delete_rule.agent_description') },
  input: z.object({ id: z.string().min(1).describe(agentText('delete_rule.id')) }),
  output: ruleOutput.describe(agentText('delete_rule.deleted')),
  describe: () => t('askAI_toolDeleteRule'),
  approvalPreview: {
    stored: {
      id: (input) => (typeof input.id === 'string' && input.id ? input.id : undefined),
      async load(id) {
        const rule = (await bookmarkRulesValue.get()).find((entry) => entry.id === id);
        return rule ? { lines: [t('askAI_approvalDeleteRule', rule.name)] } : null;
      },
      missingKey: 'askAI_ruleMissing',
    },
  },
  async precheck(input) {
    return (await bookmarkRulesValue.get()).some((rule) => rule.id === input.id)
      ? undefined
      : ruleNotFound;
  },
  async execute(input) {
    const rule = (await bookmarkRulesValue.get()).find((entry) => entry.id === input.id);
    if (!rule) return ruleNotFound;
    await deleteBookmarkRule(input.id);
    return ruleView(rule, await loadActionLibrary());
  },
});

export const RULE_ACTIONS = { listRules, saveRule, deleteRule };
