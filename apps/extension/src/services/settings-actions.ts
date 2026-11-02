/**
 * Settings as actions, for agents and Bookmark Scout's own pages alike: `listSettings` reads them
 * with their labels, scope, and whether agents may change them; `changeSettings` changes several
 * at once through the same validation as Options (`validateSettingsUpdate`, `saveSettings`).
 *
 * Agents never change a guarded setting: what AI and local agents may do and see, and what leaves
 * the device (`guarded_settings` in config/ai/actions.toml), nor a switch that needs a browser
 * permission (`SETTING_PERMISSIONS`), which only the user can grant. Every change an agent asks
 * for waits for the user's approval (`alwaysAsk`). The `ui` client may change any setting, except
 * turning on a permission switch without its permission, which Options asks for first.
 */
import { z } from 'zod';

type SettingKey = keyof Settings;

const GUARDED: ReadonlySet<string> = new Set([
  ...actionLimits.guarded_settings,
  ...Object.keys(SETTING_PERMISSIONS),
]);

/** Whether an agent may change `key`. */
export function agentMayChangeSetting(key: string): boolean {
  return isSettingsKey(key) && !GUARDED.has(key);
}

/** A value as the approval shows it: an option's label, or the value itself. */
function shownValue(key: SettingKey, value: unknown): string {
  const option = getSettingsFieldMeta()[key]?.options?.find((entry) => entry.value === value);
  if (option) return option.label;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

const settingSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.unknown(),
  scope: z.enum(SETTING_SCOPES).describe(agentText('list_settings.scope')),
  changeable: z.boolean().describe(agentText('list_settings.changeable')),
  choices: z.array(z.union([z.string(), z.number()])).optional(),
});

const listSettingsAction = defineAction({
  risk: 'read',
  labelKey: 'actionName_listSettings',
  targets: ['settings'],
  agent: { description: agentText('list_settings.agent_description') },
  input: z.object({
    keys: z
      .array(z.string())
      .max(actionLimits.max_settings)
      .optional()
      .describe(agentText('list_settings.keys')),
    query: z.string().optional().describe(agentText('list_settings.query')),
    cursor: z.string().optional().describe(agentText('cursor_input.self')),
  }),
  output: z.object({
    settings: z.array(settingSchema),
    total: z.number().int(),
    nextCursor: z.string().optional(),
  }),
  describe: () => t('askAI_toolListSettings'),
  async execute(input, context) {
    const meta = getSettingsFieldMeta();
    const query = input.query?.toLowerCase();
    const keys = (Object.keys(settingsSchema.shape) as SettingKey[]).filter(
      (key) =>
        (!input.keys || input.keys.includes(key)) &&
        (!query ||
          key.toLowerCase().includes(query) ||
          meta[key]?.label.toLowerCase().includes(query)),
    );
    const page = pageOf(keys, input.cursor, actionLimits.max_settings);
    if (isActionError(page)) return page;
    const changeable = (key: SettingKey) =>
      context.client.kind === 'ui' || agentMayChangeSetting(key);
    return {
      settings: page.items.map((key) => ({
        key,
        label: meta[key]?.label ?? key,
        value: context.settings[key],
        scope: getSettingScope(key),
        changeable: changeable(key),
        ...(meta[key]?.options ? { choices: meta[key].options.map((option) => option.value) } : {}),
      })),
      total: page.total,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  },
});

const changesInput = z.object({
  changes: z
    .record(z.string(), z.unknown())
    .refine((changes) => Object.keys(changes).length > 0, 'Name at least one setting.')
    .refine(
      (changes) => Object.keys(changes).length <= actionLimits.max_setting_changes,
      `Change at most ${actionLimits.max_setting_changes} settings at once.`,
    )
    .describe(agentText('change_settings.changes')),
});

/** Why these changes may not be made, or nothing: unknown, guarded, or invalid values. */
async function checkChanges(
  changes: Record<string, unknown>,
  context: ActionContext,
): Promise<ActionError | undefined> {
  for (const key of Object.keys(changes)) {
    if (!isSettingsKey(key)) {
      return actionError('not_found', `There is no setting named ${key}.`, {
        hint: 'Call listSettings to see the setting keys.',
      });
    }
    if (context.client.kind !== 'ui' && GUARDED.has(key)) {
      return actionError('not_allowed', `Only the user can change ${key}, in Options.`);
    }
    const feature = SETTING_PERMISSIONS[key as keyof typeof SETTING_PERMISSIONS];
    if (feature && changes[key] === true && !(await hasPermission(feature))) {
      return actionError(
        'not_allowed',
        `Turning on ${key} needs a permission only the user can grant.`,
      );
    }
  }
  const { errors } = validateSettingsUpdate(context.settings, changes);
  const [invalid] = Object.entries(errors);
  return invalid ? actionError('invalid_input', `${invalid[0]}: ${invalid[1]}`) : undefined;
}

const changeSettingsAction = defineAction({
  risk: 'write',
  alwaysAsk: true,
  labelKey: 'actionName_changeSettings',
  targets: ['settings'],
  agent: { description: agentText('change_settings.agent_description') },
  input: changesInput,
  output: z.object({
    changed: z
      .array(z.object({ key: z.string(), from: z.unknown(), to: z.unknown() }))
      .describe(agentText('change_settings.changed')),
  }),
  describe: (input) =>
    t('askAI_toolChangeSettings', formatCount(Object.keys(input.changes ?? {}).length)),
  approvalPreview: {
    lines: (input) =>
      Object.entries(isPlainObject(input.changes) ? input.changes : {}).flatMap(([key, value]) =>
        isSettingsKey(key)
          ? [
              t('askAI_approvalSetting', [
                getSettingsFieldMeta()[key]?.label ?? key,
                shownValue(key, value),
              ]),
            ]
          : [],
      ),
  },
  precheck: (input, context) => checkChanges(input.changes, context),
  async execute(input, context) {
    const refused = await checkChanges(input.changes, context);
    if (refused) return refused;
    const before = await getSettings();
    await saveSettings(input.changes as Partial<Settings>);
    const after = await getSettings();
    return {
      changed: Object.keys(input.changes)
        .filter(isSettingsKey)
        .filter((key) => !isSameJson(before[key], after[key]))
        .map((key) => ({ key, from: before[key], to: after[key] })),
    };
  },
});

export const SETTINGS_ACTIONS = {
  listSettings: listSettingsAction,
  changeSettings: changeSettingsAction,
};
