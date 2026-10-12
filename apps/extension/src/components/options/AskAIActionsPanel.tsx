/**
 * Options > AI: which bookmark actions an AI agent may use, looking things up and changing
 * bookmarks in separate groups, for Ask AI (`askAiDisabledActions`) and for local agents
 * (`agentBridgeDisabledActions`). An action turned off is left out of the agent's tools and
 * refused if called anyway. Applying a plan always asks first, whatever is chosen here
 * (`actionApproval`).
 */

type AgentActionsPanelProps = {
  kind: ActionClient['kind'];
  setting: 'askAiDisabledActions' | 'agentBridgeDisabledActions';
  panelId: string;
  titleKey: MessageKey;
  descriptionKey: MessageKey;
};

/** The agent's actions, those that only look first, each group in registry order. */
function agentActionGroups(
  kind: ActionClient['kind'],
): { titleKey: MessageKey; ids: ActionId[] }[] {
  const ids = agentActionChoices(kind);
  return [
    { titleKey: 'settings_askAiReads' as const, ids: ids.filter((id) => !changesBookmarks(id)) },
    { titleKey: 'settings_askAiWrites' as const, ids: ids.filter(changesBookmarks) },
  ].filter((group) => group.ids.length > 0);
}

function AgentActionsPanel({
  kind,
  setting,
  panelId,
  titleKey,
  descriptionKey,
}: AgentActionsPanelProps) {
  const { value: disabled, setValue } = useSetting(setting);
  const off = new Set(disabled);
  const toggle = (id: ActionId, allowed: boolean) => {
    const next = allowed ? disabled.filter((other) => other !== id) : [...disabled, id];
    void setValue(next).catch(() => undefined);
  };

  return (
    <OptionsPanel
      id={panelId}
      data-testid={panelId}
      title={t(titleKey)}
      description={t(descriptionKey)}
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
      {agentActionGroups(kind).map((group) => (
        <fieldset key={group.titleKey} className="space-y-1">
          <legend className="text-sm font-medium">{t(group.titleKey)}</legend>
          <ul className="divide-y rounded-md border">
            {group.ids.map((id) => {
              const labelKey = getAction(id).labelKey;
              return (
                <li key={id} data-action={id} className="flex min-h-10 items-center gap-2 px-3">
                  <Checkbox
                    id={`${panelId}-${id}`}
                    checked={!off.has(id)}
                    onCheckedChange={(checked) => toggle(id, checked === true)}
                  />
                  <label htmlFor={`${panelId}-${id}`} className="flex-1 text-sm">
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

export function AskAIActionsPanel() {
  return (
    <AgentActionsPanel
      kind="askAI"
      setting="askAiDisabledActions"
      panelId="ask-ai-actions"
      titleKey="settings_askAiDisabledActions"
      descriptionKey="settings_askAiDisabledActionsDesc"
    />
  );
}

export function AgentBridgeActionsPanel() {
  return (
    <AgentActionsPanel
      kind="external"
      setting="agentBridgeDisabledActions"
      panelId="agent-bridge-actions"
      titleKey="settings_agentBridgeDisabledActions"
      descriptionKey="settings_agentBridgeDisabledActionsDesc"
    />
  );
}
