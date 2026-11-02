/**
 * Smart Rules as actions, for agents and Bookmark Scout's own pages: listing the rules, saving a
 * new or changed one, and deleting one, through the rules' own storage and checks
 * (`bookmark-rules-storage.ts`, `bookmarkRuleSchema`). A rule can tag and move new bookmarks on
 * its own, so every save or delete an agent asks for waits for the user's approval (`alwaysAsk`);
 * moving new bookmarks without a review (`autoMove`) is only ever turned on by the user in Options.
 */
import { z } from 'zod';

const ruleView = (rule: BookmarkRule) => ({
  id: rule.id,
  name: rule.name,
  enabled: rule.enabled,
  query: rule.query,
  addTags: rule.addTags,
  ...(rule.moveTo ? { moveTo: rule.moveTo.path } : {}),
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
    return { rules: (await bookmarkRulesValue.get()).map(ruleView) };
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
});

type SaveRuleInput = z.infer<typeof saveRuleInput>;

/** The rule a save would store, or why it cannot: a rule it names that is gone, a folder, a check. */
async function ruleToSave(input: SaveRuleInput): Promise<BookmarkRule | ActionError> {
  const existing = input.id
    ? (await bookmarkRulesValue.get()).find((rule) => rule.id === input.id)
    : undefined;
  if (input.id && !existing) return ruleNotFound;
  let moveTo: BookmarkRule['moveTo'];
  if (input.moveTo) {
    const folder = resolveActionFolder(await loadActionLibrary(), input.moveTo);
    if (isActionError(folder)) return folder;
    moveTo = { folderId: folder.node.id, path: folder.path };
  }
  const parsed = bookmarkRuleSchema.safeParse({
    id: existing?.id ?? createBookmarkRuleId(),
    name: input.name,
    enabled: input.enabled,
    query: input.query,
    syntaxVersion: SEARCH_SYNTAX_VERSION,
    addTags: input.addTags,
    ...(moveTo ? { moveTo } : {}),
    // Moving new bookmarks without a review stays as the user set it, for the same folder only.
    ...(existing?.autoMove && moveTo?.folderId === existing.moveTo?.folderId
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
  async precheck(input) {
    const rule = await ruleToSave(input);
    return isActionError(rule) ? rule : undefined;
  },
  async execute(input) {
    const rule = await ruleToSave(input);
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
    return ruleView(rule);
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
    return ruleView(rule);
  },
});

export const RULE_ACTIONS = { listRules, saveRule, deleteRule };
