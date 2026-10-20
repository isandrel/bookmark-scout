/**
 * Options > Behavior > Bookmark manager menus: which item-menu actions the manager's right-click
 * and ⋯ menus show, and their order within each group (`managerMenuActions`; the groups come
 * from `config/ui/actions.toml`). Changes apply at once, like every setting; an empty setting is
 * the default menu.
 */
const PANEL_ID = 'manager-menus';

export function ManagerMenusPanel() {
  const { value: stored, setValue } = useSetting('managerMenuActions');
  const shown = customizeItemMenu(stored);
  const shownIds = new Set(shown.flat());
  // Each configured group, the shown actions first in the user's order, then the hidden ones.
  const groups = ACTION_MENUS.item.map((section) => [
    ...(shown.find((group) => group.some((id) => section.includes(id))) ?? []),
    ...section.filter((id) => !shownIds.has(id)),
  ]);

  const save = (next: ActionId[][]) => {
    void setValue(next.flat().filter((id) => shownIds.has(id))).catch(() => undefined);
  };
  // One command that works on any single item stays, so the menu never has nothing to offer.
  const isKept = (id: ActionId) =>
    shownIds.has(id) &&
    ITEM_MENU_KEEP_ONE_OF.includes(id) &&
    !ITEM_MENU_KEEP_ONE_OF.some((other) => other !== id && shownIds.has(other));
  const toggle = (id: ActionId, checked: boolean) => {
    if (!checked && isKept(id)) return;
    const visible = groups.flat().filter((other) => (other === id ? checked : shownIds.has(other)));
    // An empty list would mean the default menu; at least one command stays.
    if (visible.length === 0) return;
    void setValue(visible).catch(() => undefined);
  };
  const labelOf = (id: ActionId) => {
    const action = getAction(id);
    return action.labelKey ? t(action.labelKey) : id;
  };
  const keptLabels = formatList(
    ITEM_MENU_KEEP_ONE_OF.map((id) => {
      const action = getAction(id);
      return action.labelKey ? t(action.labelKey) : id;
    }),
  );
  const reorder = (groupIndex: number, ids: string[]) => {
    const next = groups.map((group, index) => (index === groupIndex ? (ids as ActionId[]) : group));
    save(next);
  };

  return (
    <OptionsPanel
      id={PANEL_ID}
      data-testid="manager-menus"
      title={t('settings_managerMenuActions')}
      description={`${t('settings_managerMenuActionsDesc')} ${t('settings_managerMenuActionsKeep', keptLabels)}`}
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={stored.length === 0}
          onClick={() => void setValue([]).catch(() => undefined)}
        >
          {t('settings_actionsReset')}
        </Button>
      }
    >
      {groups.map((group, groupIndex) => (
        <SortableList
          key={group.join()}
          items={group}
          getId={(id) => id}
          getLabel={labelOf}
          isMovable={(id) => shownIds.has(id)}
          onReorder={(ids) => reorder(groupIndex, ids)}
          label={t('settings_managerMenuActions')}
          className="divide-y rounded-md border"
          itemClassName="flex min-h-10 items-center gap-2 px-2 py-1"
          renderItem={(id, handle) => {
            const action = getAction(id);
            const Icon = action.icon ? ACTION_ICONS[action.icon] : undefined;
            return (
              <>
                {handle}
                <Checkbox
                  id={`${PANEL_ID}-${id}`}
                  checked={shownIds.has(id)}
                  // The last command that works on any one item stays (see the description).
                  disabled={isKept(id)}
                  onCheckedChange={(checked) => toggle(id, checked === true)}
                />
                <label
                  htmlFor={`${PANEL_ID}-${id}`}
                  className="flex min-w-0 flex-1 items-center gap-2 text-sm"
                  data-action={id}
                >
                  {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />}
                  <span className="truncate">{labelOf(id)}</span>
                </label>
              </>
            );
          }}
        />
      ))}
    </OptionsPanel>
  );
}
