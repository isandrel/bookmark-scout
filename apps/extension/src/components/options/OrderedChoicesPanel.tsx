/**
 * An Options panel for a setting that lists ids in the user's order, the hidden ones marked
 * (`src/lib/shown-ids.ts`):
 * a checkbox per choice to show or hide it, and a handle to reorder the shown ones within their
 * group (`SortableList`). The popup's parts, toolbar buttons, hover card details, and row menus use
 * it. Changes apply at once, like every setting.
 */
import type { ComponentType } from 'react';

type OrderedChoicesPanelProps = {
  /** Names the panel and its checkboxes (`<id>-<choice>`). */
  id: string;
  title: string;
  description: string;
  /** Every choice by group, in its default order; reordering stays within a group. */
  groups: readonly (readonly string[])[];
  /** The shown choices, in the user's order. */
  shown: readonly string[];
  labelOf: (choice: string) => string;
  iconOf?: (choice: string) => ComponentType<{ className?: string }> | undefined;
  /** A shown choice the user may not hide now, such as the bookmark tree or a menu's last command. */
  isLocked?: (choice: string, shown: ReadonlySet<string>) => boolean;
  /** Saves the shown choices, in order; the caller marks the rest hidden (`encodeShownIds`). */
  onChange: (shown: string[]) => void;
  /** Restores the default; disabled while the setting is at it. */
  onReset: () => void;
  isDefault: boolean;
};

export function OrderedChoicesPanel({
  id,
  title,
  description,
  groups,
  shown,
  labelOf,
  iconOf,
  isLocked,
  onChange,
  onReset,
  isDefault,
}: OrderedChoicesPanelProps) {
  const shownIds = new Set(shown);
  const order = new Map(shown.map((choice, index) => [choice, index]));
  // Each group: its shown choices first in the user's order, then the hidden ones.
  const displayed = groups.map((group) => [
    ...group
      .filter((choice) => shownIds.has(choice))
      .sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0)),
    ...group.filter((choice) => !shownIds.has(choice)),
  ]);
  const save = (next: readonly (readonly string[])[], visible: ReadonlySet<string>) =>
    onChange(next.flat().filter((choice) => visible.has(choice)));
  const locked = (choice: string) =>
    shownIds.has(choice) && (isLocked?.(choice, shownIds) ?? false);
  const toggle = (choice: string, checked: boolean) => {
    if (!checked && locked(choice)) return;
    const visible = new Set(shownIds);
    if (checked) visible.add(choice);
    else visible.delete(choice);
    save(displayed, visible);
  };
  const reorder = (groupIndex: number, ids: string[]) =>
    save(
      displayed.map((group, index) => (index === groupIndex ? ids : group)),
      shownIds,
    );

  return (
    <OptionsPanel
      id={id}
      data-testid={id}
      title={title}
      description={description}
      actions={
        <Button type="button" variant="outline" size="sm" disabled={isDefault} onClick={onReset}>
          {t('settings_actionsReset')}
        </Button>
      }
    >
      {displayed.map((group, groupIndex) => (
        <SortableList
          key={group.join()}
          items={group}
          getId={(choice) => choice}
          getLabel={labelOf}
          isMovable={(choice) => shownIds.has(choice)}
          onReorder={(ids) => reorder(groupIndex, ids)}
          label={title}
          className="divide-y rounded-md border"
          itemClassName="flex min-h-10 items-center gap-2 px-2 py-1"
          renderItem={(choice, handle) => {
            const Icon = iconOf?.(choice);
            return (
              <>
                {handle}
                <Checkbox
                  id={`${id}-${choice}`}
                  checked={shownIds.has(choice)}
                  disabled={locked(choice)}
                  onCheckedChange={(checked) => toggle(choice, checked === true)}
                />
                <label
                  htmlFor={`${id}-${choice}`}
                  className="flex min-w-0 flex-1 items-center gap-2 text-sm"
                  data-choice={choice}
                >
                  {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />}
                  <span className="truncate">{labelOf(choice)}</span>
                </label>
              </>
            );
          }}
        />
      ))}
    </OptionsPanel>
  );
}
