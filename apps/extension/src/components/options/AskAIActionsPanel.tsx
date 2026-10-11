/**
 * Options > AI > What Ask AI may do: the bookmark actions Ask AI is offered, read ones and ones
 * that change bookmarks (`askAiDisabledActions` lists those turned off). An action turned off is
 * left out of the AI's tools and refused if called anyway. Applying a plan always asks first,
 * whatever is chosen here (`actionApproval`).
 */

const PANEL_ID = 'ask-ai-actions';

const changesBookmarks = (id: ActionId) =>
  getAction(id).risk !== 'read' || Boolean(getAction(id).agent?.partOfChanges);

/** Ask AI's actions, those that only look first, each group in registry order. */
function agentActionGroups(): { titleKey: MessageKey; ids: ActionId[] }[] {
  const agentIds = ACTION_IDS.filter((id) => getAction(id).agent);
  return [
    {
      titleKey: 'settings_askAiReads',
      ids: agentIds.filter((id) => !changesBookmarks(id)),
    },
    {
      titleKey: 'settings_askAiWrites',
      ids: agentIds.filter(changesBookmarks),
    },
  ];
}

export function AskAIActionsPanel() {
  const { value: disabled, setValue } = useSetting('askAiDisabledActions');
  const off = new Set(disabled);
  const toggle = (id: ActionId, allowed: boolean) => {
    const next = allowed ? disabled.filter((other) => other !== id) : [...disabled, id];
    void setValue(next).catch(() => undefined);
  };

  return (
    <OptionsPanel
      id={PANEL_ID}
      data-testid="ask-ai-actions"
      title={t('settings_askAiDisabledActions')}
      description={t('settings_askAiDisabledActionsDesc')}
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled.length === 0}
          onClick={() => void setValue([]).catch(() => undefined)}
        >
          {t('settings_actionsReset')}
        </Button>
      }
    >
      {agentActionGroups().map((group) => (
        <fieldset key={group.titleKey} className="space-y-1">
          <legend className="text-sm font-medium">{t(group.titleKey)}</legend>
          <ul className="divide-y rounded-md border">
            {group.ids.map((id) => {
              const labelKey = getAction(id).labelKey;
              return (
                <li key={id} data-action={id} className="flex min-h-10 items-center gap-2 px-3">
                  <Checkbox
                    id={`${PANEL_ID}-${id}`}
                    checked={!off.has(id)}
                    onCheckedChange={(checked) => toggle(id, checked === true)}
                  />
                  <label htmlFor={`${PANEL_ID}-${id}`} className="flex-1 text-sm">
                    {labelKey ? t(labelKey) : id}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
    </OptionsPanel>
  );
}
