/**
 * Options > Behavior > Bookmark manager menus: which item-menu actions the manager's right-click
 * and ⋯ menus show, and their order within each group (`managerMenuActions`; the groups come
 * from `config/ui/actions.toml`). Changes apply at once, like every setting; an empty setting is
 * the default menu.
 */
import { ArrowDown, ArrowUp } from 'lucide-react';

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
  const toggle = (id: ActionId, checked: boolean) => {
    const visible = groups.flat().filter((other) => (other === id ? checked : shownIds.has(other)));
    // At least one command stays, so the menu never disappears.
    if (visible.length === 0) return;
    void setValue(visible).catch(() => undefined);
  };
  const move = (groupIndex: number, index: number, by: -1 | 1) => {
    const next = groups.map((group) => [...group]);
    const group = next[groupIndex];
    [group[index], group[index + by]] = [group[index + by], group[index]];
    save(next);
  };

  return (
    <OptionsPanel
      id={PANEL_ID}
      data-testid="manager-menus"
      title={t('settings_managerMenuActions')}
      description={t('settings_managerMenuActionsDesc')}
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
        <ul key={group.join()} className="divide-y rounded-md border">
          {group.map((id, index) => {
            const action = getAction(id);
            const label = action.labelKey ? t(action.labelKey) : id;
            const Icon = action.icon ? ACTION_ICONS[action.icon] : undefined;
            const visible = shownIds.has(id);
            return (
              <li key={id} data-action={id} className="flex min-h-10 items-center gap-2 px-3 py-1">
                <Checkbox
                  id={`${PANEL_ID}-${id}`}
                  checked={visible}
                  onCheckedChange={(checked) => toggle(id, checked === true)}
                />
                <label
                  htmlFor={`${PANEL_ID}-${id}`}
                  className="flex min-w-0 flex-1 items-center gap-2 text-sm"
                >
                  {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />}
                  <span className="truncate">{label}</span>
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('settings_actionMoveUp', label)}
                  title={t('settings_actionMoveUp', label)}
                  disabled={!visible || index === 0 || !shownIds.has(group[index - 1])}
                  onClick={() => move(groupIndex, index, -1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('settings_actionMoveDown', label)}
                  title={t('settings_actionMoveDown', label)}
                  disabled={!visible || !shownIds.has(group[index + 1] ?? '')}
                  onClick={() => move(groupIndex, index, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      ))}
    </OptionsPanel>
  );
}
