/**
 * The action a review leaves each item on: the default until the user picks another. Picks belong
 * to the items they were made for, so a new scan starts again from the defaults.
 */
import { useState } from 'react';

export function useReviewChoices<Item, Action extends string>(
  items: readonly Item[],
  idOf: (item: Item) => string,
  defaultOf: (item: Item) => Action,
) {
  const [picked, setPicked] = useState({ items, actions: {} as Record<string, Action> });
  const actions = picked.items === items ? picked.actions : {};
  const actionOf = (item: Item): Action => actions[idOf(item)] ?? defaultOf(item);
  const setAction = (ids: readonly string[], action: Action) =>
    setPicked({
      items,
      actions: { ...actions, ...Object.fromEntries(ids.map((id) => [id, action])) },
    });
  return {
    actionOf,
    setAction,
    chosen: (action: Action) => items.filter((item) => actionOf(item) === action),
  };
}
