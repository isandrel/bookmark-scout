/**
 * A list setting edited as a checklist the user reorders: the shown choices first, in their stored
 * order, each with a handle (drag, or its menu of moves) and a checkbox, then the hidden ones. Used
 * for the manager's Default Columns, Card Fields, and Preview Details. The setting stores the shown
 * ids in order; at least one stays shown.
 */

type OrderedChoicesListProps = {
  /** Every id the setting can hold, in their default order. */
  choices: readonly string[];
  /** The shown ids, in order, as stored; unknown ids are left out. */
  value: readonly string[];
  onChange: (next: string[]) => void;
  getLabel: (id: string) => string;
  /** The list's accessible name, and the prefix of each checkbox's id. */
  label: string;
  idPrefix: string;
};

export function OrderedChoicesList({
  choices,
  value,
  onChange,
  getLabel,
  label,
  idPrefix,
}: OrderedChoicesListProps) {
  const shown = [...new Set(value)].filter((id) => choices.includes(id));
  const items = [...shown, ...choices.filter((id) => !shown.includes(id))];
  const toggle = (id: string, checked: boolean) => {
    // The last shown choice stays, so the view always has something to show.
    if (!checked && shown.length === 1 && shown[0] === id) return;
    onChange(checked ? [...shown, id] : shown.filter((other) => other !== id));
  };
  return (
    <SortableList
      items={items}
      getId={(id) => id}
      getLabel={getLabel}
      isMovable={(id) => shown.includes(id)}
      onReorder={(ids) => onChange(ids.filter((id) => shown.includes(id)))}
      label={label}
      className="divide-y rounded-md border"
      itemClassName="flex min-h-10 items-center gap-2 px-2 py-1"
      itemProps={(id) => ({ 'data-choice': id })}
      renderItem={(id, handle) => (
        <>
          {handle}
          <Checkbox
            id={`${idPrefix}-${id}`}
            checked={shown.includes(id)}
            disabled={shown.length === 1 && shown[0] === id}
            onCheckedChange={(checked) => toggle(id, checked === true)}
          />
          <label htmlFor={`${idPrefix}-${id}`} className="min-w-0 flex-1 truncate text-sm">
            {getLabel(id)}
          </label>
        </>
      )}
    />
  );
}
